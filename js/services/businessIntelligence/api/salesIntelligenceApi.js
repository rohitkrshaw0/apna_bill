// api/salesIntelligenceApi.js (Milestone 12C)
// The Sales Intelligence Services layer -- a new, sibling file to
// api/inventoryIntelligenceApi.js (12A) and api/purchaseIntelligenceApi.js
// (12B), both frozen, using the exact same composition-root shape:
// createXApi({ loadSnapshot, cache, diagnostics, recordAudit,
// resolveActiveCompanyId }). Every getX() function here composes sales/,
// metrics/, calculators/ (via metrics), aggregators/, recommendations/,
// and models/ so no calculation ever needs to be duplicated in UI code.
//
// Cache and diagnostics are REUSED, not reimplemented -- defaults to the
// SAME shared `insightCache` and `biDiagnostics` singletons 12A/12B already
// use. Collision-free because every cache key here is prefixed
// `salesMetrics:...`, distinct from `itemMetrics:...` (12A) and
// `purchaseMetrics:...` (12B).
//
// One sales scan per call: loadSalesSnapshot() runs once,
// computeSalesMetrics()/computeCustomerMetrics() run once over it, and
// every aggregator below reads that same snapshot/metrics.

import { loadSalesSnapshot } from '../sales/salesDataLoader.js';
import { computeSalesMetrics } from '../metrics/salesMetrics.js';
import { computeCustomerMetrics } from '../metrics/customerMetrics.js';
import { aggregateSalesSummary } from '../aggregators/salesSummaryAggregator.js';
import { aggregateCategorySalesSummary } from '../aggregators/categorySalesSummaryAggregator.js';
import { aggregatePurchaseTrendSummary } from '../aggregators/purchaseTrendSummaryAggregator.js';
import { aggregateSalesFrequencySummary } from '../aggregators/salesFrequencySummaryAggregator.js';
import { aggregateRevenueRanking } from '../aggregators/revenueRankingAggregator.js';
import { aggregateCustomerRanking } from '../aggregators/customerRankingAggregator.js';
import { aggregateTopPurchasedItems } from '../aggregators/topPurchasedItemsAggregator.js';
import { aggregateWorstSellingItems } from '../aggregators/worstSellingItemsAggregator.js';
import { aggregateSeasonalitySummary } from '../aggregators/seasonalitySummaryAggregator.js';
import { buildItemSalesRecommendations, buildCustomerRecommendations } from '../recommendations/salesRecommendations.js';
import { buildSalesSummaryModel } from '../models/salesInsightModels.js';
import { createBiDiagnostics, biDiagnostics as sharedBiDiagnostics } from '../diagnostics/biDiagnostics.js';
import { createInsightCache, insightCache as sharedInsightCache } from '../cache/insightCache.js';
import { recordSalesInsightGenerated } from '../audit/salesAuditReporter.js';
import { getActiveCompanyId } from '../../../supabaseClient.js';
import { DEFAULT_LOOKBACK_DAYS } from '../shared/config.js';

/**
 * @param {object} [deps] dependency injection seam for tests/isolated instances
 * @param {typeof loadSalesSnapshot} [deps.loadSnapshot]
 * @param {ReturnType<typeof createInsightCache>} [deps.cache]
 * @param {ReturnType<typeof createBiDiagnostics>} [deps.diagnostics]
 * @param {typeof recordSalesInsightGenerated} [deps.recordAudit]
 * @param {() => string|null} [deps.resolveActiveCompanyId]
 */
export function createSalesIntelligenceApi ({
  loadSnapshot = loadSalesSnapshot,
  cache = sharedInsightCache,
  diagnostics = sharedBiDiagnostics,
  recordAudit = recordSalesInsightGenerated,
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
  async function getSalesMetricsSnapshot ({ companyId, lookbackDays = DEFAULT_LOOKBACK_DAYS, useCache = true } = {}) {
    const co = resolveCompanyId(companyId);
    const cacheKey = `salesMetrics:${lookbackDays}`;

    if (useCache) {
      const cached = cache.get(co, cacheKey);
      if (cached !== undefined) {
        diagnostics.recordCacheHit(cacheKey);
        return cached;
      }
      diagnostics.recordCacheMiss(cacheKey);
    }

    const result = await diagnostics.time('computeSalesMetricsSnapshot', async () => {
      const snapshot = await loadSnapshot({ companyId: co, lookbackDays });
      const salesMetrics = computeSalesMetrics(snapshot, {});
      const customerMetrics = computeCustomerMetrics(snapshot);
      return { companyId: co, generatedAt: snapshot.generatedAt, lookbackDays, snapshot, salesMetrics, customerMetrics };
    });

    if (useCache) cache.set(co, cacheKey, result);
    return result;
  }

  function companyAvgOrderValue (customerMetrics) {
    const totalOrderCount = customerMetrics.reduce((sum, m) => sum + m.orderCount, 0);
    const totalOrderValue = customerMetrics.reduce((sum, m) => sum + m.totalSalesValue, 0);
    return totalOrderCount > 0 ? totalOrderValue / totalOrderCount : null;
  }

  /** @param {object} [opts] */
  async function getSalesSummary (opts = {}) {
    const { companyId, generatedAt, lookbackDays, snapshot, salesMetrics, customerMetrics } = await getSalesMetricsSnapshot(opts);
    return diagnostics.time('getSalesSummary', () => {
      const categoryPerformance = aggregateCategorySalesSummary(salesMetrics);
      const topCategories = categoryPerformance.slice(0, 3).map((c) => c.category);
      const context = { companyAvgOrderValue: companyAvgOrderValue(customerMetrics), topCategories };

      return buildSalesSummaryModel({
        companyId, generatedAt, lookbackDays,
        summary: aggregateSalesSummary(salesMetrics, customerMetrics, opts),
        categoryPerformance,
        trendSummary: aggregatePurchaseTrendSummary(salesMetrics),
        frequencySummary: aggregateSalesFrequencySummary(salesMetrics, opts),
        revenueRanking: aggregateRevenueRanking(salesMetrics, opts),
        customerRanking: aggregateCustomerRanking(customerMetrics, opts),
        topSellingItems: aggregateTopPurchasedItems(salesMetrics, { topN: opts.topN, by: opts.by || 'netSales' }),
        worstSellingItems: aggregateWorstSellingItems(salesMetrics, opts),
        topCustomers: aggregateTopPurchasedItems(customerMetrics, { topN: opts.topN, by: 'totalSalesValue' }),
        seasonality: aggregateSeasonalitySummary(snapshot),
        itemRecommendations: buildItemSalesRecommendations(salesMetrics, opts),
        customerRecommendations: buildCustomerRecommendations(customerMetrics, context, opts)
      });
    }, { itemsAnalyzed: salesMetrics.length, customersAnalyzed: customerMetrics.length });
  }

  /** @param {object} [opts] just the revenue/margin headline figures */
  async function getRevenueSummary (opts = {}) {
    const { companyId, generatedAt, lookbackDays, salesMetrics } = await getSalesMetricsSnapshot(opts);
    return diagnostics.time('getRevenueSummary', () => {
      const summary = aggregateSalesSummary(salesMetrics, [], opts);
      return {
        companyId, generatedAt, lookbackDays,
        totalGrossSales: summary.totalGrossSales,
        totalReturnsValue: summary.totalReturnsValue,
        totalNetSales: summary.totalNetSales,
        avgSellingPrice: summary.avgSellingPrice,
        overallGrossMarginPct: summary.overallGrossMarginPct
      };
    }, { itemsAnalyzed: salesMetrics.length });
  }

  /** @param {object} [opts] company-wide rising/falling/stable classification */
  async function getSalesTrends (opts = {}) {
    const { salesMetrics } = await getSalesMetricsSnapshot(opts);
    return diagnostics.time('getSalesTrends', () => aggregatePurchaseTrendSummary(salesMetrics), { itemsAnalyzed: salesMetrics.length });
  }

  /** @param {object} [opts] */
  async function getTopSellingItems (opts = {}) {
    const { salesMetrics } = await getSalesMetricsSnapshot(opts);
    return diagnostics.time('getTopSellingItems', () => aggregateTopPurchasedItems(salesMetrics, opts), { itemsAnalyzed: salesMetrics.length });
  }

  /** @param {object} [opts] */
  async function getWorstSellingItems (opts = {}) {
    const { salesMetrics } = await getSalesMetricsSnapshot(opts);
    return diagnostics.time('getWorstSellingItems', () => aggregateWorstSellingItems(salesMetrics, opts), { itemsAnalyzed: salesMetrics.length });
  }

  /** @param {object} [opts] */
  async function getCustomerRanking (opts = {}) {
    const { customerMetrics } = await getSalesMetricsSnapshot(opts);
    return diagnostics.time('getCustomerRanking', () => aggregateCustomerRanking(customerMetrics, opts), { customersAnalyzed: customerMetrics.length });
  }

  /** @param {object} [opts] */
  async function getCategoryPerformance (opts = {}) {
    const { salesMetrics } = await getSalesMetricsSnapshot(opts);
    return diagnostics.time('getCategoryPerformance', () => aggregateCategorySalesSummary(salesMetrics), { itemsAnalyzed: salesMetrics.length });
  }

  /** @param {object} [opts] */
  async function getSalesRecommendations (opts = {}) {
    const { customerMetrics, salesMetrics } = await getSalesMetricsSnapshot(opts);
    return diagnostics.time('getSalesRecommendations', () => {
      const categoryPerformance = aggregateCategorySalesSummary(salesMetrics);
      const topCategories = categoryPerformance.slice(0, 3).map((c) => c.category);
      const context = { companyAvgOrderValue: companyAvgOrderValue(customerMetrics), topCategories };
      return {
        items: buildItemSalesRecommendations(salesMetrics, opts),
        customers: buildCustomerRecommendations(customerMetrics, context, opts)
      };
    }, { itemsAnalyzed: salesMetrics.length, customersAnalyzed: customerMetrics.length });
  }

  /** @param {object} [opts] */
  async function getTopCustomers (opts = {}) {
    const { customerMetrics } = await getSalesMetricsSnapshot(opts);
    return diagnostics.time('getTopCustomers', () => aggregateTopPurchasedItems(customerMetrics, { topN: opts.topN, by: opts.by || 'totalSalesValue' }), { customersAnalyzed: customerMetrics.length });
  }

  /** @param {object} [opts] */
  async function getSeasonality (opts = {}) {
    const { snapshot } = await getSalesMetricsSnapshot(opts);
    return diagnostics.time('getSeasonality', () => aggregateSeasonalitySummary(snapshot), {});
  }

  /** @param {object} [opts] */
  async function getRevenueRanking (opts = {}) {
    const { salesMetrics } = await getSalesMetricsSnapshot(opts);
    return diagnostics.time('getRevenueRanking', () => aggregateRevenueRanking(salesMetrics, opts), { itemsAnalyzed: salesMetrics.length });
  }

  /**
   * Generates a full sales insight report AND records it in the Audit
   * Platform. Every getX() above deliberately does NOT call this.
   * @param {{companyId?: string, lookbackDays?: number, useCache?: boolean, reportType?: 'onDemand'|'export'|'scheduled'}} [opts]
   */
  async function generateSalesInsightReport ({ reportType = 'onDemand', ...opts } = {}) {
    const model = await getSalesSummary(opts);
    recordAudit({
      companyId: model.companyId,
      reportType,
      itemsAnalyzed: model.summary.itemCount,
      customersAnalyzed: model.summary.customerCount,
      generatedAt: model.generatedAt
    });
    return model;
  }

  return {
    getSalesMetricsSnapshot,
    getSalesSummary,
    getRevenueSummary,
    getSalesTrends,
    getTopSellingItems,
    getWorstSellingItems,
    getCustomerRanking,
    getCategoryPerformance,
    getSalesRecommendations,
    getTopCustomers,
    getSeasonality,
    getRevenueRanking,
    generateSalesInsightReport
  };
}

/** The application-wide Sales Intelligence API instance, wired to the real Supabase-backed loader, shared cache, and shared diagnostics. */
export const salesIntelligence = createSalesIntelligenceApi();
