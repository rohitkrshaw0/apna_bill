// api/pricingIntelligenceApi.js (Milestone 12D)
// The Pricing Intelligence Services layer -- a new, sibling file to
// api/inventoryIntelligenceApi.js (12A), api/purchaseIntelligenceApi.js
// (12B), and api/salesIntelligenceApi.js (12C), all frozen, using the
// exact same composition-root shape: createXApi({ loadSnapshot, cache,
// diagnostics, recordAudit, resolveActiveCompanyId }). Every getX()
// function here composes pricing/, metrics/, calculators/ (via metrics),
// aggregators/, recommendations/, and models/ so no calculation ever needs
// to be duplicated in UI code.
//
// Cache and diagnostics are REUSED, not reimplemented -- defaults to the
// SAME shared `insightCache` and `biDiagnostics` singletons 12A/12B/12C
// already use. Collision-free because every cache key here is prefixed
// `pricingMetrics:...`, distinct from `itemMetrics:...` (12A),
// `purchaseMetrics:...` (12B), and `salesMetrics:...` (12C).
//
// One pricing scan per call: loadPricingSnapshot() runs once (itself
// composing loadPurchaseSnapshot/loadSalesSnapshot, each also run exactly
// once), computePricingMetrics() runs once over it, and every aggregator
// below reads that same metrics array.

import { loadPricingSnapshot } from '../pricing/pricingDataLoader.js';
import { computePricingMetrics } from '../metrics/pricingMetrics.js';
import { aggregatePricingSummary } from '../aggregators/pricingSummaryAggregator.js';
import { aggregateCategoryPricingSummary } from '../aggregators/categoryPricingSummaryAggregator.js';
import { aggregatePriceTrendSummary } from '../aggregators/priceTrendSummaryAggregator.js';
import { aggregateDiscountSummary } from '../aggregators/discountSummaryAggregator.js';
import { aggregateMarginThreshold } from '../aggregators/marginThresholdAggregator.js';
import { aggregateTopPurchasedItems } from '../aggregators/topPurchasedItemsAggregator.js';
import { aggregateWorstSellingItems } from '../aggregators/worstSellingItemsAggregator.js';
import { aggregateCostHistory } from '../aggregators/costHistoryAggregator.js';
import { aggregateSellingPriceHistory } from '../aggregators/sellingPriceHistoryAggregator.js';
import { buildPricingRecommendations } from '../recommendations/pricingRecommendations.js';
import { buildPricingSummaryModel } from '../models/pricingInsightModels.js';
import { createBiDiagnostics, biDiagnostics as sharedBiDiagnostics } from '../diagnostics/biDiagnostics.js';
import { createInsightCache, insightCache as sharedInsightCache } from '../cache/insightCache.js';
import { recordPricingInsightGenerated } from '../audit/pricingAuditReporter.js';
import { getActiveCompanyId } from '../../../supabaseClient.js';
import { DEFAULT_LOOKBACK_DAYS } from '../shared/config.js';

/**
 * @param {object} [deps] dependency injection seam for tests/isolated instances
 * @param {typeof loadPricingSnapshot} [deps.loadSnapshot]
 * @param {ReturnType<typeof createInsightCache>} [deps.cache]
 * @param {ReturnType<typeof createBiDiagnostics>} [deps.diagnostics]
 * @param {typeof recordPricingInsightGenerated} [deps.recordAudit]
 * @param {() => string|null} [deps.resolveActiveCompanyId]
 */
export function createPricingIntelligenceApi ({
  loadSnapshot = loadPricingSnapshot,
  cache = sharedInsightCache,
  diagnostics = sharedBiDiagnostics,
  recordAudit = recordPricingInsightGenerated,
  resolveActiveCompanyId = getActiveCompanyId
} = {}) {
  function resolveCompanyId (companyId) {
    const co = companyId || resolveActiveCompanyId();
    if (!co) throw new Error('businessIntelligence: no active company');
    return co;
  }

  // aggregateTopPurchasedItems/aggregateWorstSellingItems (both reused
  // verbatim, frozen) treat a missing field as `0` via their own `a[by]||0`
  // sort -- correct for a genuinely-zero metric, but a `null` marginPct/
  // avgDiscountPct means "no price-point to compare" (never sold, or never
  // purchased), not "zero margin". Filtering those out before ranking
  // keeps the frozen aggregators unmodified while never mis-ranking an
  // item with no pricing signal as the "lowest margin"/"least discounted".
  function withMarginPct (list) {
    return list.filter((m) => m.marginPct !== null);
  }
  function withDiscountPct (list) {
    return list.filter((m) => m.avgDiscountPct !== null);
  }

  /**
   * The one shared "scan + compute metrics" step every getX() below reuses.
   * @param {{companyId?: string, lookbackDays?: number, useCache?: boolean}} opts
   */
  async function getPricingMetricsSnapshot ({ companyId, lookbackDays = DEFAULT_LOOKBACK_DAYS, useCache = true } = {}) {
    const co = resolveCompanyId(companyId);
    const cacheKey = `pricingMetrics:${lookbackDays}`;

    if (useCache) {
      const cached = cache.get(co, cacheKey);
      if (cached !== undefined) {
        diagnostics.recordCacheHit(cacheKey);
        return cached;
      }
      diagnostics.recordCacheMiss(cacheKey);
    }

    const result = await diagnostics.time('computePricingMetricsSnapshot', async () => {
      const snapshot = await loadSnapshot({ companyId: co, lookbackDays });
      const pricingMetrics = computePricingMetrics(snapshot, {});
      return { companyId: co, generatedAt: snapshot.generatedAt, lookbackDays, snapshot, pricingMetrics };
    });

    if (useCache) cache.set(co, cacheKey, result);
    return result;
  }

  /** @param {object} [opts] */
  async function getPricingSummary (opts = {}) {
    const { companyId, generatedAt, lookbackDays, pricingMetrics } = await getPricingMetricsSnapshot(opts);
    return diagnostics.time('getPricingSummary', () => buildPricingSummaryModel({
      companyId, generatedAt, lookbackDays,
      summary: aggregatePricingSummary(pricingMetrics, opts),
      categoryPerformance: aggregateCategoryPricingSummary(pricingMetrics),
      trendSummary: aggregatePriceTrendSummary(pricingMetrics),
      discountSummary: aggregateDiscountSummary(pricingMetrics),
      highestMarginItems: aggregateTopPurchasedItems(withMarginPct(pricingMetrics), { topN: opts.topN, by: 'marginPct' }),
      lowestMarginItems: aggregateWorstSellingItems(withMarginPct(pricingMetrics), { bottomN: opts.bottomN, by: 'marginPct' }),
      recommendations: buildPricingRecommendations(pricingMetrics, opts)
    }), { itemsAnalyzed: pricingMetrics.length });
  }

  /** @param {object} [opts] margin-focused view: company-wide average plus the above/below-target split */
  async function getMarginAnalysis (opts = {}) {
    const { pricingMetrics } = await getPricingMetricsSnapshot(opts);
    return diagnostics.time('getMarginAnalysis', () => {
      const threshold = aggregateMarginThreshold(pricingMetrics, opts);
      const withMargin = pricingMetrics.filter((m) => m.marginPct !== null);
      const avgMarginPct = withMargin.length ? withMargin.reduce((sum, m) => sum + m.marginPct, 0) / withMargin.length : null;
      return { avgMarginPct, ...threshold, items: pricingMetrics };
    }, { itemsAnalyzed: pricingMetrics.length });
  }

  /** @param {object} [opts] markup-focused view: company-wide average plus every item's own markup % */
  async function getMarkupAnalysis (opts = {}) {
    const { pricingMetrics } = await getPricingMetricsSnapshot(opts);
    return diagnostics.time('getMarkupAnalysis', () => {
      const withMarkup = pricingMetrics.filter((m) => m.markupPct !== null);
      const avgMarkupPct = withMarkup.length ? withMarkup.reduce((sum, m) => sum + m.markupPct, 0) / withMarkup.length : null;
      return { avgMarkupPct, items: pricingMetrics };
    }, { itemsAnalyzed: pricingMetrics.length });
  }

  /** @param {{itemId: string} & object} opts one item's full purchase- and selling-price history */
  async function getPriceHistory ({ itemId, ...opts } = {}) {
    const { snapshot } = await getPricingMetricsSnapshot(opts);
    return diagnostics.time('getPriceHistory', () => ({
      itemId,
      purchaseHistory: aggregateCostHistory(snapshot.purchaseSnapshot, itemId),
      sellingHistory: aggregateSellingPriceHistory(snapshot.salesSnapshot, itemId)
    }), {});
  }

  /** @param {object} [opts] company-wide rising/falling/stable selling-price classification */
  async function getPriceTrends (opts = {}) {
    const { pricingMetrics } = await getPricingMetricsSnapshot(opts);
    return diagnostics.time('getPriceTrends', () => aggregatePriceTrendSummary(pricingMetrics), { itemsAnalyzed: pricingMetrics.length });
  }

  /** @param {object} [opts] */
  async function getDiscountAnalysis (opts = {}) {
    const { pricingMetrics } = await getPricingMetricsSnapshot(opts);
    return diagnostics.time('getDiscountAnalysis', () => ({
      ...aggregateDiscountSummary(pricingMetrics),
      mostDiscountedItems: aggregateTopPurchasedItems(withDiscountPct(pricingMetrics), { topN: opts.topN, by: 'avgDiscountPct' })
    }), { itemsAnalyzed: pricingMetrics.length });
  }

  /** @param {object} [opts] */
  async function getHighestMarginItems (opts = {}) {
    const { pricingMetrics } = await getPricingMetricsSnapshot(opts);
    return diagnostics.time('getHighestMarginItems', () => aggregateTopPurchasedItems(withMarginPct(pricingMetrics), { ...opts, by: 'marginPct' }), { itemsAnalyzed: pricingMetrics.length });
  }

  /** @param {object} [opts] */
  async function getLowestMarginItems (opts = {}) {
    const { pricingMetrics } = await getPricingMetricsSnapshot(opts);
    return diagnostics.time('getLowestMarginItems', () => aggregateWorstSellingItems(withMarginPct(pricingMetrics), { ...opts, by: 'marginPct' }), { itemsAnalyzed: pricingMetrics.length });
  }

  /** @param {object} [opts] */
  async function getCategoryPricing (opts = {}) {
    const { pricingMetrics } = await getPricingMetricsSnapshot(opts);
    return diagnostics.time('getCategoryPricing', () => aggregateCategoryPricingSummary(pricingMetrics), { itemsAnalyzed: pricingMetrics.length });
  }

  /** @param {object} [opts] advisory only -- never filtered to "actionable only", every item gets a row (see recommendations/pricingRecommendations.js) */
  async function getPricingRecommendations (opts = {}) {
    const { pricingMetrics } = await getPricingMetricsSnapshot(opts);
    return diagnostics.time('getPricingRecommendations', () => buildPricingRecommendations(pricingMetrics, opts), { itemsAnalyzed: pricingMetrics.length });
  }

  /**
   * Generates a full pricing insight report AND records it in the Audit
   * Platform. Every getX() above deliberately does NOT call this.
   * @param {{companyId?: string, lookbackDays?: number, useCache?: boolean, reportType?: 'onDemand'|'export'|'scheduled'}} [opts]
   */
  async function generatePricingInsightReport ({ reportType = 'onDemand', ...opts } = {}) {
    const model = await getPricingSummary(opts);
    recordAudit({
      companyId: model.companyId,
      reportType,
      itemsAnalyzed: model.summary.itemCount,
      generatedAt: model.generatedAt
    });
    return model;
  }

  return {
    getPricingMetricsSnapshot,
    getPricingSummary,
    getMarginAnalysis,
    getMarkupAnalysis,
    getPriceHistory,
    getPriceTrends,
    getDiscountAnalysis,
    getHighestMarginItems,
    getLowestMarginItems,
    getCategoryPricing,
    getPricingRecommendations,
    generatePricingInsightReport
  };
}

/** The application-wide Pricing Intelligence API instance, wired to the real Supabase-backed loader, shared cache, and shared diagnostics. */
export const pricingIntelligence = createPricingIntelligenceApi();
