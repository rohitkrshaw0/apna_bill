// api/purchaseIntelligenceApi.js (Milestone 12B)
// The Purchase Intelligence Services layer -- a new, sibling file to
// api/inventoryIntelligenceApi.js (12A, frozen, unmodified by this
// milestone), using the exact same composition-root shape:
// createXApi({ loadSnapshot, cache, diagnostics, recordAudit,
// resolveActiveCompanyId }). Every getX() function here composes
// purchase/, metrics/, calculators/ (via metrics), aggregators/,
// recommendations/, and models/ so no calculation ever needs to be
// duplicated in UI code.
//
// Cache and diagnostics are REUSED, not reimplemented: this file defaults
// to the SAME shared `insightCache` singleton and the SAME shared
// `biDiagnostics` singleton api/inventoryIntelligenceApi.js already uses --
// one cache, one diagnostics recorder, for the whole Business Intelligence
// platform, exactly per the brief ("Reuse the existing cache
// implementation. Do NOT create another cache." / "Reuse Diagnostics...
// Do NOT build another diagnostics framework."). Collision-free because
// every cache key here is prefixed `purchaseMetrics:...`, distinct from
// inventory's own `itemMetrics:...` prefix.
//
// One purchase scan per call: loadPurchaseSnapshot() runs once,
// computePurchaseMetrics()/computeSupplierMetrics() run once over it, and
// every aggregator below reads that same snapshot/metrics -- no aggregator
// re-queries the database or rescans raw rows itself.

import { loadPurchaseSnapshot } from '../purchase/purchaseDataLoader.js';
import { computePurchaseMetrics } from '../metrics/purchaseMetrics.js';
import { computeSupplierMetrics } from '../metrics/supplierMetrics.js';
import { aggregatePurchaseSummary } from '../aggregators/purchaseSummaryAggregator.js';
import { aggregateCategoryPurchaseSummary } from '../aggregators/categoryPurchaseSummaryAggregator.js';
import { aggregatePurchaseTrendSummary } from '../aggregators/purchaseTrendSummaryAggregator.js';
import { aggregatePurchaseFrequencySummary } from '../aggregators/purchaseFrequencySummaryAggregator.js';
import { aggregateSupplierRanking } from '../aggregators/supplierRankingAggregator.js';
import { aggregateTopPurchasedItems } from '../aggregators/topPurchasedItemsAggregator.js';
import { aggregateSupplierComparison } from '../aggregators/supplierComparisonAggregator.js';
import { aggregatePreferredSupplier } from '../aggregators/preferredSupplierAggregator.js';
import { aggregateCostHistory } from '../aggregators/costHistoryAggregator.js';
import { buildPurchaseRecommendations, buildPurchaseRecommendation } from '../recommendations/purchaseRecommendations.js';
import { buildPurchaseSummaryModel, buildItemPurchaseInsightModel } from '../models/purchaseInsightModels.js';
import { createBiDiagnostics, biDiagnostics as sharedBiDiagnostics } from '../diagnostics/biDiagnostics.js';
import { createInsightCache, insightCache as sharedInsightCache } from '../cache/insightCache.js';
import { recordPurchaseInsightGenerated } from '../audit/purchaseAuditReporter.js';
import { getActiveCompanyId } from '../../../supabaseClient.js';
import { DEFAULT_LOOKBACK_DAYS } from '../shared/config.js';

/**
 * @param {object} [deps] dependency injection seam for tests/isolated instances
 * @param {typeof loadPurchaseSnapshot} [deps.loadSnapshot]
 * @param {ReturnType<typeof createInsightCache>} [deps.cache]
 * @param {ReturnType<typeof createBiDiagnostics>} [deps.diagnostics]
 * @param {typeof recordPurchaseInsightGenerated} [deps.recordAudit]
 * @param {() => string|null} [deps.resolveActiveCompanyId]
 */
export function createPurchaseIntelligenceApi ({
  loadSnapshot = loadPurchaseSnapshot,
  cache = sharedInsightCache,
  diagnostics = sharedBiDiagnostics,
  recordAudit = recordPurchaseInsightGenerated,
  resolveActiveCompanyId = getActiveCompanyId
} = {}) {
  function resolveCompanyId (companyId) {
    const co = companyId || resolveActiveCompanyId();
    if (!co) throw new Error('businessIntelligence: no active company');
    return co;
  }

  /**
   * The one shared "scan + compute metrics" step every getX() below reuses.
   * @param {{companyId?: string, lookbackDays?: number, useCache?: boolean}} opts
   */
  async function getPurchaseMetricsSnapshot ({ companyId, lookbackDays = DEFAULT_LOOKBACK_DAYS, useCache = true } = {}) {
    const co = resolveCompanyId(companyId);
    const cacheKey = `purchaseMetrics:${lookbackDays}`;

    if (useCache) {
      const cached = cache.get(co, cacheKey);
      if (cached !== undefined) {
        diagnostics.recordCacheHit(cacheKey);
        return cached;
      }
      diagnostics.recordCacheMiss(cacheKey);
    }

    const result = await diagnostics.time('computePurchaseMetricsSnapshot', async () => {
      const snapshot = await loadSnapshot({ companyId: co, lookbackDays });
      const purchaseMetrics = computePurchaseMetrics(snapshot);
      const supplierMetrics = computeSupplierMetrics(snapshot);
      return { companyId: co, generatedAt: snapshot.generatedAt, lookbackDays, snapshot, purchaseMetrics, supplierMetrics };
    });

    if (useCache) cache.set(co, cacheKey, result);
    return result;
  }

  function buildSupplierComparisonByItemId (snapshot, purchaseMetrics) {
    return new Map(purchaseMetrics.map((m) => [m.itemId, aggregateSupplierComparison(snapshot, m.itemId)]));
  }

  /** @param {object} [opts] */
  async function getPurchaseSummary (opts = {}) {
    const { companyId, generatedAt, lookbackDays, snapshot, purchaseMetrics, supplierMetrics } = await getPurchaseMetricsSnapshot(opts);
    return diagnostics.time('getPurchaseSummary', () => {
      const summary = aggregatePurchaseSummary(purchaseMetrics, supplierMetrics, opts);
      const recommendations = buildPurchaseRecommendations(purchaseMetrics, buildSupplierComparisonByItemId(snapshot, purchaseMetrics), opts);
      return buildPurchaseSummaryModel({
        companyId, generatedAt, lookbackDays, summary,
        categoryPerformance: aggregateCategoryPurchaseSummary(purchaseMetrics),
        trendSummary: aggregatePurchaseTrendSummary(purchaseMetrics),
        frequencySummary: aggregatePurchaseFrequencySummary(purchaseMetrics, opts),
        supplierRanking: aggregateSupplierRanking(supplierMetrics, opts),
        topPurchasedItems: aggregateTopPurchasedItems(purchaseMetrics, opts),
        recommendations
      });
    }, { itemsAnalyzed: purchaseMetrics.length, suppliersCompared: supplierMetrics.length });
  }

  /** @param {{itemId: string}} args */
  async function getAveragePurchasePrice ({ itemId, ...opts } = {}) {
    const { purchaseMetrics } = await getPurchaseMetricsSnapshot(opts);
    return diagnostics.time('getAveragePurchasePrice', () => {
      const metric = purchaseMetrics.find((m) => m.itemId === itemId);
      return metric ? metric.avgPurchasePrice : null;
    }, { itemsAnalyzed: purchaseMetrics.length });
  }

  /** @param {{itemId: string}} args -- the full per-item purchase insight model */
  async function getPurchaseHistory ({ itemId, ...opts } = {}) {
    const { companyId, generatedAt, lookbackDays, snapshot, purchaseMetrics } = await getPurchaseMetricsSnapshot(opts);
    return diagnostics.time('getPurchaseHistory', () => {
      const itemMetric = purchaseMetrics.find((m) => m.itemId === itemId) || null;
      const priceHistory = aggregateCostHistory(snapshot, itemId);
      const supplierComparison = aggregateSupplierComparison(snapshot, itemId);
      const preferredSupplier = aggregatePreferredSupplier(snapshot, itemId);
      const recommendation = itemMetric ? buildPurchaseRecommendation(itemMetric, supplierComparison, opts) : null;
      return buildItemPurchaseInsightModel({ companyId, generatedAt, lookbackDays, itemId, itemMetric, priceHistory, supplierComparison, preferredSupplier, recommendation });
    }, { itemsAnalyzed: purchaseMetrics.length });
  }

  /** @param {{itemId: string}} args -- raw chronological price history only */
  async function getCostHistory ({ itemId, ...opts } = {}) {
    const { snapshot, purchaseMetrics } = await getPurchaseMetricsSnapshot(opts);
    return diagnostics.time('getCostHistory', () => aggregateCostHistory(snapshot, itemId), { itemsAnalyzed: purchaseMetrics.length });
  }

  /** @param {object} [opts] company-wide rising/falling/stable classification */
  async function getPurchaseTrends (opts = {}) {
    const { purchaseMetrics } = await getPurchaseMetricsSnapshot(opts);
    return diagnostics.time('getPurchaseTrends', () => aggregatePurchaseTrendSummary(purchaseMetrics), { itemsAnalyzed: purchaseMetrics.length });
  }

  /** @param {{itemId: string}} args */
  async function getSupplierComparison ({ itemId, ...opts } = {}) {
    const { snapshot, purchaseMetrics } = await getPurchaseMetricsSnapshot(opts);
    return diagnostics.time('getSupplierComparison', () => aggregateSupplierComparison(snapshot, itemId), { itemsAnalyzed: purchaseMetrics.length });
  }

  /** @param {object} [opts] */
  async function getSupplierRanking (opts = {}) {
    const { supplierMetrics } = await getPurchaseMetricsSnapshot(opts);
    return diagnostics.time('getSupplierRanking', () => aggregateSupplierRanking(supplierMetrics, opts), { itemsAnalyzed: supplierMetrics.length });
  }

  /** @param {{itemId: string}} args */
  async function getPreferredSupplier ({ itemId, ...opts } = {}) {
    const { snapshot, purchaseMetrics } = await getPurchaseMetricsSnapshot(opts);
    return diagnostics.time('getPreferredSupplier', () => aggregatePreferredSupplier(snapshot, itemId), { itemsAnalyzed: purchaseMetrics.length });
  }

  /** @param {{itemId?: string}} [args] per-item frequency if itemId given, else the company-wide high/low bucket summary */
  async function getPurchaseFrequency ({ itemId, ...opts } = {}) {
    const { purchaseMetrics } = await getPurchaseMetricsSnapshot(opts);
    return diagnostics.time('getPurchaseFrequency', () => {
      if (itemId) {
        const metric = purchaseMetrics.find((m) => m.itemId === itemId);
        return metric ? metric.purchaseFrequencyPerYear : null;
      }
      return aggregatePurchaseFrequencySummary(purchaseMetrics, opts);
    }, { itemsAnalyzed: purchaseMetrics.length });
  }

  /** @param {object} [opts] */
  async function getTopPurchasedItems (opts = {}) {
    const { purchaseMetrics } = await getPurchaseMetricsSnapshot(opts);
    return diagnostics.time('getTopPurchasedItems', () => aggregateTopPurchasedItems(purchaseMetrics, opts), { itemsAnalyzed: purchaseMetrics.length });
  }

  /** @param {object} [opts] */
  async function getCategoryPurchases (opts = {}) {
    const { purchaseMetrics } = await getPurchaseMetricsSnapshot(opts);
    return diagnostics.time('getCategoryPurchases', () => aggregateCategoryPurchaseSummary(purchaseMetrics), { itemsAnalyzed: purchaseMetrics.length });
  }

  /** @param {object} [opts] */
  async function getPurchaseRecommendations (opts = {}) {
    const { snapshot, purchaseMetrics } = await getPurchaseMetricsSnapshot(opts);
    return diagnostics.time('getPurchaseRecommendations', () =>
      buildPurchaseRecommendations(purchaseMetrics, buildSupplierComparisonByItemId(snapshot, purchaseMetrics), opts),
    { itemsAnalyzed: purchaseMetrics.length });
  }

  /**
   * Generates a full purchase insight report AND records it in the Audit
   * Platform (per the brief: "Audit only: Purchase Intelligence exports,
   * Scheduled intelligence generation, Generated reports"). Every getX()
   * above deliberately does NOT call this.
   * @param {{companyId?: string, lookbackDays?: number, useCache?: boolean, reportType?: 'onDemand'|'export'|'scheduled'}} [opts]
   */
  async function generatePurchaseInsightReport ({ reportType = 'onDemand', ...opts } = {}) {
    const model = await getPurchaseSummary(opts);
    recordAudit({
      companyId: model.companyId,
      reportType,
      itemsAnalyzed: model.summary.itemCount,
      suppliersCompared: model.summary.supplierCount,
      generatedAt: model.generatedAt
    });
    return model;
  }

  return {
    getPurchaseMetricsSnapshot,
    getPurchaseSummary,
    getAveragePurchasePrice,
    getPurchaseHistory,
    getCostHistory,
    getPurchaseTrends,
    getSupplierComparison,
    getSupplierRanking,
    getPreferredSupplier,
    getPurchaseFrequency,
    getTopPurchasedItems,
    getCategoryPurchases,
    getPurchaseRecommendations,
    generatePurchaseInsightReport
  };
}

/** The application-wide Purchase Intelligence API instance, wired to the real Supabase-backed loader, shared cache, and shared diagnostics. */
export const purchaseIntelligence = createPurchaseIntelligenceApi();
