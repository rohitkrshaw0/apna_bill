// api/supplierIntelligenceApi.js (Milestone 12E)
// The Supplier Intelligence Services layer -- a new, sibling file to
// api/inventoryIntelligenceApi.js (12A), api/purchaseIntelligenceApi.js
// (12B), api/salesIntelligenceApi.js (12C), and api/pricingIntelligenceApi.js
// (12D), all frozen, but the ONE place this milestone's own composition
// root structurally diverges from every prior domain's `createXApi({
// loadSnapshot, cache, diagnostics, recordAudit, resolveActiveCompanyId })`
// shape -- per this milestone's own "MOST IMPORTANT ARCHITECTURAL RULE"
// ("Supplier Intelligence MUST COMPOSE existing intelligence... It must
// NOT recreate it"), there is no `loadSnapshot` here at all. Instead, this
// file composes FOUR sibling domains' own public API instances
// (`purchaseIntelligence`, `pricingIntelligence`, `salesIntelligence`,
// `inventoryIntelligence`) -- calling their own `getXMetricsSnapshot()`
// functions (each already cache-checked, diagnostics-wrapped, and reused
// verbatim), never a raw Supabase query of its own. This is the same
// "compose two sibling snapshots instead of a fresh scan" move
// pricing/pricingDataLoader.js (12D) made at the LOADER level, taken one
// level further: here it happens at the API level, across four domains,
// because the brief's own diagram ("Supplier Performance = Purchase
// History + Pricing History + Sales Performance + Inventory Performance")
// explicitly names the INTELLIGENCE layer, not just raw data, as what this
// domain consumes.
//
// Cache and diagnostics are still REUSED, not reimplemented -- defaults to
// the SAME shared `insightCache` and `biDiagnostics` singletons every
// prior domain uses. Collision-free because this domain's own cache key is
// prefixed `supplierMetrics:...`, distinct from `itemMetrics:...` (12A),
// `purchaseMetrics:...` (12B), `salesMetrics:...` (12C), and
// `pricingMetrics:...` (12D). Caching the COMPOSED result is still
// worthwhile even though all four sibling snapshots are independently
// cached too -- it avoids repeating the per-supplier grouping/merge work
// (grouping purchase lines by supplier, building item-id maps, summing
// contribution figures) on every call.

import { purchaseIntelligence } from './purchaseIntelligenceApi.js';
import { pricingIntelligence } from './pricingIntelligenceApi.js';
import { salesIntelligence } from './salesIntelligenceApi.js';
import { inventoryIntelligence } from './inventoryIntelligenceApi.js';
import { computeSupplierPerformanceMetrics } from '../metrics/supplierPerformanceMetrics.js';
import { aggregatePreferredSupplierCounts } from '../aggregators/preferredSupplierCountAggregator.js';
import { aggregateSupplierPerformanceSummary } from '../aggregators/supplierPerformanceSummaryAggregator.js';
import { aggregateSupplierCategorySummary } from '../aggregators/supplierCategorySummaryAggregator.js';
import { aggregatePurchaseTrendSummary } from '../aggregators/purchaseTrendSummaryAggregator.js';
import { aggregatePurchaseFrequencySummary } from '../aggregators/purchaseFrequencySummaryAggregator.js';
import { aggregateSupplierRanking } from '../aggregators/supplierRankingAggregator.js';
import { aggregateTopPurchasedItems } from '../aggregators/topPurchasedItemsAggregator.js';
import { aggregateWorstSellingItems } from '../aggregators/worstSellingItemsAggregator.js';
import { aggregateSupplierCostHistory } from '../aggregators/supplierCostHistoryAggregator.js';
import { buildSupplierRecommendation, buildSupplierRecommendations } from '../recommendations/supplierRecommendations.js';
import { buildSupplierSummaryModel } from '../models/supplierInsightModels.js';
import { createBiDiagnostics, biDiagnostics as sharedBiDiagnostics } from '../diagnostics/biDiagnostics.js';
import { createInsightCache, insightCache as sharedInsightCache } from '../cache/insightCache.js';
import { recordSupplierInsightGenerated } from '../audit/supplierAuditReporter.js';
import { getActiveCompanyId } from '../../../supabaseClient.js';
import { DEFAULT_LOOKBACK_DAYS } from '../shared/config.js';

/**
 * @param {object} [deps] dependency injection seam for tests/isolated instances -- note the four sibling API instances, not a loadSnapshot, per this file's own header comment
 * @param {ReturnType<typeof import('./purchaseIntelligenceApi.js').createPurchaseIntelligenceApi>} [deps.purchaseIntel]
 * @param {ReturnType<typeof import('./pricingIntelligenceApi.js').createPricingIntelligenceApi>} [deps.pricingIntel]
 * @param {ReturnType<typeof import('./salesIntelligenceApi.js').createSalesIntelligenceApi>} [deps.salesIntel]
 * @param {ReturnType<typeof import('./inventoryIntelligenceApi.js').createInventoryIntelligenceApi>} [deps.inventoryIntel]
 * @param {ReturnType<typeof createInsightCache>} [deps.cache]
 * @param {ReturnType<typeof createBiDiagnostics>} [deps.diagnostics]
 * @param {typeof recordSupplierInsightGenerated} [deps.recordAudit]
 * @param {() => string|null} [deps.resolveActiveCompanyId]
 */
export function createSupplierIntelligenceApi ({
  purchaseIntel = purchaseIntelligence,
  pricingIntel = pricingIntelligence,
  salesIntel = salesIntelligence,
  inventoryIntel = inventoryIntelligence,
  cache = sharedInsightCache,
  diagnostics = sharedBiDiagnostics,
  recordAudit = recordSupplierInsightGenerated,
  resolveActiveCompanyId = getActiveCompanyId
} = {}) {
  function resolveCompanyId (companyId) {
    const co = companyId || resolveActiveCompanyId();
    if (!co) throw new Error('businessIntelligence: no active company');
    return co;
  }

  /**
   * The one shared "compose four sibling snapshots + merge" step every
   * getX() below reuses.
   * @param {{companyId?: string, lookbackDays?: number, useCache?: boolean}} opts
   */
  async function getSupplierMetricsSnapshot ({ companyId, lookbackDays = DEFAULT_LOOKBACK_DAYS, useCache = true } = {}) {
    const co = resolveCompanyId(companyId);
    const cacheKey = `supplierMetrics:${lookbackDays}`;

    if (useCache) {
      const cached = cache.get(co, cacheKey);
      if (cached !== undefined) {
        diagnostics.recordCacheHit(cacheKey);
        return cached;
      }
      diagnostics.recordCacheMiss(cacheKey);
    }

    const result = await diagnostics.time('computeSupplierMetricsSnapshot', async () => {
      const [purchaseSnap, pricingSnap, salesSnap, inventorySnap] = await Promise.all([
        purchaseIntel.getPurchaseMetricsSnapshot({ companyId: co, lookbackDays, useCache }),
        pricingIntel.getPricingMetricsSnapshot({ companyId: co, lookbackDays, useCache }),
        salesIntel.getSalesMetricsSnapshot({ companyId: co, lookbackDays, useCache }),
        inventoryIntel.getItemMetricsSnapshot({ companyId: co, lookbackDays, activeOnly: false, useCache })
      ]);

      const performanceMetrics = computeSupplierPerformanceMetrics({
        supplierMetrics: purchaseSnap.supplierMetrics,
        purchaseSnapshot: purchaseSnap.snapshot,
        pricingMetrics: pricingSnap.pricingMetrics,
        salesMetrics: salesSnap.salesMetrics,
        itemMetrics: inventorySnap.itemMetrics
      });

      const preferredCounts = aggregatePreferredSupplierCounts(purchaseSnap.snapshot);
      const supplierMetrics = performanceMetrics.map((m) => ({ ...m, preferredItemCount: preferredCounts.get(m.supplierId) || 0 }));

      return { companyId: co, generatedAt: purchaseSnap.generatedAt, lookbackDays, purchaseSnapshot: purchaseSnap.snapshot, supplierMetrics };
    });

    if (useCache) cache.set(co, cacheKey, result);
    return result;
  }

  /** @param {object} [opts] */
  async function getSupplierSummary (opts = {}) {
    const { companyId, generatedAt, lookbackDays, supplierMetrics } = await getSupplierMetricsSnapshot(opts);
    return diagnostics.time('getSupplierSummary', () => {
      const totalPurchaseValue = supplierMetrics.reduce((sum, s) => sum + s.purchaseValue, 0);
      const context = { totalPurchaseValue };

      return buildSupplierSummaryModel({
        companyId, generatedAt, lookbackDays,
        summary: aggregateSupplierPerformanceSummary(supplierMetrics, opts),
        categoryPerformance: aggregateSupplierCategorySummary(supplierMetrics),
        trendSummary: aggregatePurchaseTrendSummary(supplierMetrics),
        frequencySummary: aggregatePurchaseFrequencySummary(supplierMetrics, opts),
        supplierRanking: aggregateSupplierRanking(supplierMetrics, opts),
        topSuppliers: aggregateTopPurchasedItems(supplierMetrics, { topN: opts.topN, by: opts.by || 'purchaseValue' }),
        weakSuppliers: aggregateWorstSellingItems(supplierMetrics, { bottomN: opts.bottomN, by: opts.by || 'purchaseValue' }),
        recommendations: buildSupplierRecommendations(supplierMetrics, context, opts)
      });
    }, { suppliersAnalyzed: supplierMetrics.length });
  }

  /** @param {object} [opts] suppliers ranked descending by the chosen field (default purchaseValue) -- reuses aggregateSupplierRanking (12B) verbatim */
  async function getSupplierRanking (opts = {}) {
    const { supplierMetrics } = await getSupplierMetricsSnapshot(opts);
    return diagnostics.time('getSupplierRanking', () => aggregateSupplierRanking(supplierMetrics, opts), { suppliersAnalyzed: supplierMetrics.length });
  }

  /** @param {object} [opts] every supplier, side by side, with every composed performance figure */
  async function getSupplierComparison (opts = {}) {
    const { supplierMetrics } = await getSupplierMetricsSnapshot(opts);
    return diagnostics.time('getSupplierComparison', () => aggregateSupplierRanking(supplierMetrics, { by: opts.by || 'purchaseValue' }), { suppliersAnalyzed: supplierMetrics.length });
  }

  /** @param {object} [opts] the topN suppliers by how often they are the cheapest (preferred) source for an item */
  async function getPreferredSuppliers (opts = {}) {
    const { supplierMetrics } = await getSupplierMetricsSnapshot(opts);
    return diagnostics.time('getPreferredSuppliers', () => aggregateTopPurchasedItems(supplierMetrics, { topN: opts.topN, by: 'preferredItemCount' }), { suppliersAnalyzed: supplierMetrics.length });
  }

  /** @param {{supplierId: string} & object} opts one supplier's full detail: its own composed metric, purchase-price history across every item, and its own recommendation */
  async function getSupplierPerformance ({ supplierId, ...opts } = {}) {
    const { supplierMetrics, purchaseSnapshot } = await getSupplierMetricsSnapshot(opts);
    return diagnostics.time('getSupplierPerformance', () => {
      const metric = supplierMetrics.find((s) => s.supplierId === supplierId) || null;
      const totalPurchaseValue = supplierMetrics.reduce((sum, s) => sum + s.purchaseValue, 0);
      return {
        supplierId,
        metric,
        costHistory: aggregateSupplierCostHistory(purchaseSnapshot, supplierId),
        recommendation: metric ? buildSupplierRecommendation(metric, { totalPurchaseValue }, opts) : null
      };
    }, { suppliersAnalyzed: supplierMetrics.length });
  }

  /** @param {object} [opts] pricing-focused view: company-wide average plus every supplier's own discount/margin-contribution/stability figures */
  async function getSupplierPricing (opts = {}) {
    const { supplierMetrics } = await getSupplierMetricsSnapshot(opts);
    return diagnostics.time('getSupplierPricing', () => {
      const withMargin = supplierMetrics.filter((s) => s.marginContributionPct !== null);
      const avgMarginContributionPct = withMargin.length ? withMargin.reduce((sum, s) => sum + s.marginContributionPct, 0) / withMargin.length : null;
      const withDiscount = supplierMetrics.filter((s) => s.avgDiscountPct !== null);
      const avgDiscountPct = withDiscount.length ? withDiscount.reduce((sum, s) => sum + s.avgDiscountPct, 0) / withDiscount.length : null;
      return { avgMarginContributionPct, avgDiscountPct, suppliers: supplierMetrics };
    }, { suppliersAnalyzed: supplierMetrics.length });
  }

  /** @param {object} [opts] contribution-focused view: every supplier's revenue/margin/inventory contribution, ranked by revenue contribution descending */
  async function getSupplierContribution (opts = {}) {
    const { supplierMetrics } = await getSupplierMetricsSnapshot(opts);
    return diagnostics.time('getSupplierContribution', () => aggregateSupplierRanking(supplierMetrics, { by: 'revenueContribution' }), { suppliersAnalyzed: supplierMetrics.length });
  }

  /** @param {object} [opts] advisory only -- never filtered to "actionable only", every supplier gets a row (see recommendations/supplierRecommendations.js) */
  async function getSupplierRecommendations (opts = {}) {
    const { supplierMetrics } = await getSupplierMetricsSnapshot(opts);
    return diagnostics.time('getSupplierRecommendations', () => {
      const totalPurchaseValue = supplierMetrics.reduce((sum, s) => sum + s.purchaseValue, 0);
      return buildSupplierRecommendations(supplierMetrics, { totalPurchaseValue }, opts);
    }, { suppliersAnalyzed: supplierMetrics.length });
  }

  /**
   * Generates a full supplier insight report AND records it in the Audit
   * Platform. Every getX() above deliberately does NOT call this.
   * @param {{companyId?: string, lookbackDays?: number, useCache?: boolean, reportType?: 'onDemand'|'export'|'scheduled'}} [opts]
   */
  async function generateSupplierInsightReport ({ reportType = 'onDemand', ...opts } = {}) {
    const model = await getSupplierSummary(opts);
    recordAudit({
      companyId: model.companyId,
      reportType,
      suppliersAnalyzed: model.summary.supplierCount,
      generatedAt: model.generatedAt
    });
    return model;
  }

  return {
    getSupplierMetricsSnapshot,
    getSupplierSummary,
    getSupplierRanking,
    getSupplierComparison,
    getPreferredSuppliers,
    getSupplierPerformance,
    getSupplierPricing,
    getSupplierContribution,
    getSupplierRecommendations,
    generateSupplierInsightReport
  };
}

/** The application-wide Supplier Intelligence API instance, wired to the real, shared Purchase/Pricing/Sales/Inventory Intelligence instances, shared cache, and shared diagnostics. */
export const supplierIntelligence = createSupplierIntelligenceApi();
