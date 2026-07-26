// api/inventoryIntelligenceApi.js
// The Business Intelligence Services layer (milestone brief architecture:
// "ERP -> Metrics -> Calculators -> Aggregators -> Insight Models ->
// Business Intelligence Services -> Dashboard / Reports / Extensions").
// This is the ONLY file a future Dashboard, Report, or Extension should
// import from -- every getX() function here composes the layers below it
// (inventory/, metrics/, calculators/, aggregators/, recommendations/,
// models/) so no calculation ever needs to be duplicated in UI code (per
// the brief: "The Dashboard must NEVER contain calculations").
//
// One inventory scan per call: loadSnapshot() runs once, computeItemMetrics()
// runs once over it, and every aggregator below reads that same
// itemMetrics array -- no aggregator re-queries the database or rescans
// raw rows itself.
//
// Cache-then-compute, diagnostics-wrapped, audit-only-for-reports/exports/
// scheduled-jobs -- see cache/insightCache.js, diagnostics/biDiagnostics.js,
// audit/biAuditReporter.js for why each exists.

import { loadInventorySnapshot } from '../inventory/inventoryDataLoader.js';
import { computeItemMetrics } from '../metrics/itemMetrics.js';
import { aggregateLowStock } from '../aggregators/lowStockAggregator.js';
import { aggregateOutOfStock } from '../aggregators/outOfStockAggregator.js';
import { aggregateDeadStock } from '../aggregators/deadStockAggregator.js';
import { aggregateSlowMoving } from '../aggregators/slowMovingAggregator.js';
import { aggregateFastMoving } from '../aggregators/fastMovingAggregator.js';
import { aggregateOverstock } from '../aggregators/overstockAggregator.js';
import { aggregateInventorySummary } from '../aggregators/inventorySummaryAggregator.js';
import { aggregateCategorySummary } from '../aggregators/categorySummaryAggregator.js';
import { aggregateReorderSummary } from '../aggregators/reorderSummaryAggregator.js';
import { buildInventoryValueModel, buildInventoryInsightModel } from '../models/insightModels.js';
import { createBiDiagnostics, biDiagnostics as sharedBiDiagnostics } from '../diagnostics/biDiagnostics.js';
import { createInsightCache, insightCache as sharedInsightCache } from '../cache/insightCache.js';
import { recordInventoryInsightGenerated } from '../audit/biAuditReporter.js';
import { getActiveCompanyId } from '../../../supabaseClient.js';
import { DEFAULT_LOOKBACK_DAYS } from '../shared/config.js';

/**
 * @param {object} [deps] dependency injection seam for tests/isolated instances
 * @param {typeof loadInventorySnapshot} [deps.loadSnapshot]
 * @param {ReturnType<typeof createInsightCache>} [deps.cache]
 * @param {ReturnType<typeof createBiDiagnostics>} [deps.diagnostics]
 * @param {typeof recordInventoryInsightGenerated} [deps.recordAudit]
 * @param {() => string|null} [deps.resolveActiveCompanyId]
 */
export function createInventoryIntelligenceApi ({
  loadSnapshot = loadInventorySnapshot,
  cache = sharedInsightCache,
  diagnostics = sharedBiDiagnostics,
  recordAudit = recordInventoryInsightGenerated,
  resolveActiveCompanyId = getActiveCompanyId
} = {}) {
  function resolveCompanyId (companyId) {
    const co = companyId || resolveActiveCompanyId();
    if (!co) throw new Error('businessIntelligence: no active company');
    return co;
  }

  /**
   * The one shared "scan + compute metrics" step every getX() below reuses.
   * @param {{companyId?: string, lookbackDays?: number, activeOnly?: boolean, useCache?: boolean}} opts
   * @returns {Promise<{companyId: string, generatedAt: string, lookbackDays: number, itemMetrics: object[]}>}
   */
  async function getItemMetricsSnapshot ({ companyId, lookbackDays = DEFAULT_LOOKBACK_DAYS, activeOnly = true, useCache = true } = {}) {
    const co = resolveCompanyId(companyId);
    const cacheKey = `itemMetrics:${lookbackDays}:${activeOnly}`;

    if (useCache) {
      const cached = cache.get(co, cacheKey);
      if (cached !== undefined) {
        diagnostics.recordCacheHit(cacheKey);
        return cached;
      }
      diagnostics.recordCacheMiss(cacheKey);
    }

    const result = await diagnostics.time('computeItemMetricsSnapshot', async () => {
      const snapshot = await loadSnapshot({ companyId: co, lookbackDays, activeOnly });
      const itemMetrics = computeItemMetrics(snapshot);
      return { companyId: co, generatedAt: snapshot.generatedAt, lookbackDays, itemMetrics };
    });

    if (useCache) cache.set(co, cacheKey, result);
    return result;
  }

  /** @param {{companyId?: string, lookbackDays?: number, activeOnly?: boolean, useCache?: boolean}} [opts] */
  async function getInventorySummary (opts = {}) {
    const { companyId, generatedAt, lookbackDays, itemMetrics } = await getItemMetricsSnapshot(opts);
    return diagnostics.time('getInventorySummary', () => {
      const summary = aggregateInventorySummary(itemMetrics, { ...opts, lookbackDays });
      return buildInventoryInsightModel({
        companyId, generatedAt, lookbackDays, summary,
        lowStock: aggregateLowStock(itemMetrics),
        outOfStock: aggregateOutOfStock(itemMetrics),
        deadStock: aggregateDeadStock(itemMetrics, opts),
        slowMoving: aggregateSlowMoving(itemMetrics, opts),
        fastMoving: aggregateFastMoving(itemMetrics, opts),
        overstock: aggregateOverstock(itemMetrics, opts),
        categoryPerformance: aggregateCategorySummary(itemMetrics),
        reorderSummary: aggregateReorderSummary(itemMetrics, opts)
      });
    }, { itemsAnalyzed: itemMetrics.length });
  }

  /** @param {object} [opts] */
  async function getInventoryValue (opts = {}) {
    const { companyId, generatedAt, lookbackDays, itemMetrics } = await getItemMetricsSnapshot(opts);
    return diagnostics.time('getInventoryValue', () => {
      const summary = aggregateInventorySummary(itemMetrics, { ...opts, lookbackDays });
      return buildInventoryValueModel({ companyId, generatedAt, lookbackDays, summary });
    }, { itemsAnalyzed: itemMetrics.length });
  }

  /** @param {object} [opts] */
  async function getLowStockItems (opts = {}) {
    const { itemMetrics } = await getItemMetricsSnapshot(opts);
    return diagnostics.time('getLowStockItems', () => aggregateLowStock(itemMetrics), { itemsAnalyzed: itemMetrics.length });
  }

  /** @param {object} [opts] */
  async function getOutOfStockItems (opts = {}) {
    const { itemMetrics } = await getItemMetricsSnapshot(opts);
    return diagnostics.time('getOutOfStockItems', () => aggregateOutOfStock(itemMetrics), { itemsAnalyzed: itemMetrics.length });
  }

  /** @param {object} [opts] */
  async function getDeadStock (opts = {}) {
    const { itemMetrics } = await getItemMetricsSnapshot(opts);
    return diagnostics.time('getDeadStock', () => aggregateDeadStock(itemMetrics, opts), { itemsAnalyzed: itemMetrics.length });
  }

  /** @param {object} [opts] */
  async function getSlowMovingItems (opts = {}) {
    const { itemMetrics } = await getItemMetricsSnapshot(opts);
    return diagnostics.time('getSlowMovingItems', () => aggregateSlowMoving(itemMetrics, opts), { itemsAnalyzed: itemMetrics.length });
  }

  /** @param {object} [opts] */
  async function getFastMovingItems (opts = {}) {
    const { itemMetrics } = await getItemMetricsSnapshot(opts);
    return diagnostics.time('getFastMovingItems', () => aggregateFastMoving(itemMetrics, opts), { itemsAnalyzed: itemMetrics.length });
  }

  /** @param {object} [opts] */
  async function getOverstockItems (opts = {}) {
    const { itemMetrics } = await getItemMetricsSnapshot(opts);
    return diagnostics.time('getOverstockItems', () => aggregateOverstock(itemMetrics, opts), { itemsAnalyzed: itemMetrics.length });
  }

  /** @param {object} [opts] */
  async function getCategoryPerformance (opts = {}) {
    const { itemMetrics } = await getItemMetricsSnapshot(opts);
    return diagnostics.time('getCategoryPerformance', () => aggregateCategorySummary(itemMetrics), { itemsAnalyzed: itemMetrics.length });
  }

  /** @param {object} [opts] @returns {Promise<number|null>} the company-wide annualized turnover ratio */
  async function getInventoryTurnover (opts = {}) {
    const { lookbackDays, itemMetrics } = await getItemMetricsSnapshot(opts);
    return diagnostics.time('getInventoryTurnover', () => {
      const summary = aggregateInventorySummary(itemMetrics, { ...opts, lookbackDays });
      return summary.overallTurnoverRatio;
    }, { itemsAnalyzed: itemMetrics.length });
  }

  /** @param {object} [opts] */
  async function getReorderRecommendations (opts = {}) {
    const { itemMetrics } = await getItemMetricsSnapshot(opts);
    return diagnostics.time('getReorderRecommendations', () => aggregateReorderSummary(itemMetrics, opts), { itemsAnalyzed: itemMetrics.length });
  }

  /**
   * Generates a full inventory insight report AND records it in the Audit
   * Platform (per the brief: "Audit only: Generated reports, Dashboard
   * exports, Scheduled BI jobs"). Every getX() above deliberately does NOT
   * call this -- routine reads are not audited, only an explicit report/
   * export/scheduled-job invocation is.
   * @param {{companyId?: string, lookbackDays?: number, activeOnly?: boolean, useCache?: boolean, reportType?: 'onDemand'|'export'|'scheduled'}} [opts]
   */
  async function generateInventoryInsightReport ({ reportType = 'onDemand', ...opts } = {}) {
    const model = await getInventorySummary(opts);
    recordAudit({
      companyId: model.companyId,
      reportType,
      itemsAnalyzed: model.summary.itemCount,
      generatedAt: model.generatedAt
    });
    return model;
  }

  return {
    getItemMetricsSnapshot,
    getInventorySummary,
    getInventoryValue,
    getLowStockItems,
    getOutOfStockItems,
    getDeadStock,
    getSlowMovingItems,
    getFastMovingItems,
    getOverstockItems,
    getCategoryPerformance,
    getInventoryTurnover,
    getReorderRecommendations,
    generateInventoryInsightReport
  };
}

/** The application-wide Inventory Intelligence API instance, wired to the real Supabase-backed loader, shared cache, and shared diagnostics. */
export const inventoryIntelligence = createInventoryIntelligenceApi();
