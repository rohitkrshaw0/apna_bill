// dashboard/businessSnapshotProvider.js (Milestone 12F)
// The FIRST of two new platform concepts this milestone adds (the other is
// dashboard/dashboardProvider.js). Composes Inventory (12A), Purchase (12B),
// Sales (12C), Pricing (12D), and Supplier (12E) Intelligence -- calling
// each domain's own public `getXSummary()` function, never a raw Supabase
// query, never `metrics/`/`calculators/`/`aggregators/` directly. This is
// the same "compose FOUR sibling domain APIs" move
// api/supplierIntelligenceApi.js (12E) made, taken one level further: FIVE
// domains, including Supplier Intelligence itself (which is already a
// composition of the other four).
//
// "No calculations. No formatting. No HTML." (this milestone's own
// "BUSINESS SNAPSHOT PROVIDER" section) is true of every line below:
// `selectAlerts()` only FILTERS each domain's own already-computed
// recommendation rows to their own already-computed boolean flags (no new
// boolean is derived, no arithmetic happens); `selectKpis()` only PLUCKS
// already-computed headline numbers out of each summary's own `.summary`
// object. Neither function invents a number, a percentage, or a string
// this platform did not already compute somewhere else.
//
// One composition per call (not five separate scans this domain runs
// itself) -- `getBusinessSnapshot()` calls the five sibling `getXSummary()`
// functions in `Promise.all`, each already its own domain's own
// cache-checked, diagnostics-wrapped composition step, then caches the
// COMPOSED result under its own `businessSnapshot:${lookbackDays}` key so
// the selection/assembly work below isn't repeated on every call either.

import { inventoryIntelligence } from '../api/inventoryIntelligenceApi.js';
import { purchaseIntelligence } from '../api/purchaseIntelligenceApi.js';
import { salesIntelligence } from '../api/salesIntelligenceApi.js';
import { pricingIntelligence } from '../api/pricingIntelligenceApi.js';
import { supplierIntelligence } from '../api/supplierIntelligenceApi.js';
import { buildBusinessSnapshotModel } from '../models/businessSnapshotModel.js';
import { createBiDiagnostics, biDiagnostics as sharedBiDiagnostics } from '../diagnostics/biDiagnostics.js';
import { createInsightCache, insightCache as sharedInsightCache } from '../cache/insightCache.js';
import { getActiveCompanyId } from '../../../supabaseClient.js';
import { DEFAULT_LOOKBACK_DAYS } from '../shared/config.js';

/**
 * Filters each domain's own already-computed recommendation rows down to
 * the ones already flagged true on an already-named warning/opportunity
 * field. A pure selection over pre-existing booleans -- never derives a
 * new flag, never touches a number.
 * @param {{inventory: object, purchase: object, sales: object, pricing: object, supplier: object}} summaries
 */
function selectAlerts ({ inventory, purchase, sales, pricing, supplier }) {
  return {
    // getReorderRecommendations()'s own output (embedded as
    // InventoryInsightModel.recommendations) is ALREADY filtered to
    // actionable-only rows (urgent/high/normal priority) -- reused as-is,
    // no further filtering needed.
    inventory: inventory.recommendations.recommendations,
    purchase: purchase.recommendations.filter((r) => r.priceIncreaseWarning || r.supplierConsolidationOpportunity),
    sales: sales.recommendations.items.filter((r) => r.productRequiresAttention),
    pricing: pricing.recommendations.filter((r) => r.lowMarginWarning || r.highDiscountWarning || r.priceConsistencyWarning || r.supplierCostIncreaseAlert),
    supplier: supplier.recommendations.filter((r) => r.priceIncreaseWarning || r.supplierReviewNeeded || r.lowPerformingSupplier)
  };
}

/**
 * Plucks already-computed headline figures out of each domain's own
 * `.summary` (or top-level, for inventory) object. A pure selection --
 * every value here already exists verbatim on one of the five embedded
 * summaries.
 */
function selectKpis ({ inventory, purchase, sales, pricing, supplier }) {
  return {
    totalInventoryValue: inventory.inventoryValue.totalInventoryValue,
    inventoryTurnoverRatio: inventory.stockTurnover.overallTurnoverRatio,
    totalPurchaseValue: purchase.summary.totalPurchaseValue,
    totalNetSales: sales.summary.totalNetSales,
    overallGrossMarginPct: sales.summary.overallGrossMarginPct,
    avgMarginPct: pricing.summary.avgMarginPct,
    avgMarkupPct: pricing.summary.avgMarkupPct,
    supplierCount: supplier.summary.supplierCount,
    totalSupplierPurchaseValue: supplier.summary.totalPurchaseValue
  };
}

/**
 * @param {object} [deps] dependency injection seam for tests/isolated instances -- five sibling API instances, not a loadSnapshot, the same shape api/supplierIntelligenceApi.js (12E) already established for a cross-domain composition root
 * @param {typeof inventoryIntelligence} [deps.inventoryIntel]
 * @param {typeof purchaseIntelligence} [deps.purchaseIntel]
 * @param {typeof salesIntelligence} [deps.salesIntel]
 * @param {typeof pricingIntelligence} [deps.pricingIntel]
 * @param {typeof supplierIntelligence} [deps.supplierIntel]
 * @param {ReturnType<typeof createInsightCache>} [deps.cache]
 * @param {ReturnType<typeof createBiDiagnostics>} [deps.diagnostics]
 * @param {() => string|null} [deps.resolveActiveCompanyId]
 */
export function createBusinessSnapshotProvider ({
  inventoryIntel = inventoryIntelligence,
  purchaseIntel = purchaseIntelligence,
  salesIntel = salesIntelligence,
  pricingIntel = pricingIntelligence,
  supplierIntel = supplierIntelligence,
  cache = sharedInsightCache,
  diagnostics = sharedBiDiagnostics,
  resolveActiveCompanyId = getActiveCompanyId
} = {}) {
  function resolveCompanyId (companyId) {
    const co = companyId || resolveActiveCompanyId();
    if (!co) throw new Error('businessIntelligence: no active company');
    return co;
  }

  /**
   * @param {{companyId?: string, lookbackDays?: number, useCache?: boolean}} [opts]
   * @returns {Promise<object>} the frozen BusinessSnapshot model
   */
  async function getBusinessSnapshot ({ companyId, lookbackDays = DEFAULT_LOOKBACK_DAYS, useCache = true } = {}) {
    const co = resolveCompanyId(companyId);
    const cacheKey = `businessSnapshot:${lookbackDays}`;

    if (useCache) {
      const cached = cache.get(co, cacheKey);
      if (cached !== undefined) {
        diagnostics.recordCacheHit(cacheKey);
        return cached;
      }
      diagnostics.recordCacheMiss(cacheKey);
    }

    const result = await diagnostics.time('computeBusinessSnapshot', async () => {
      const [inventory, purchase, sales, pricing, supplier] = await Promise.all([
        inventoryIntel.getInventorySummary({ companyId: co, lookbackDays, useCache }),
        purchaseIntel.getPurchaseSummary({ companyId: co, lookbackDays, useCache }),
        salesIntel.getSalesSummary({ companyId: co, lookbackDays, useCache }),
        pricingIntel.getPricingSummary({ companyId: co, lookbackDays, useCache }),
        supplierIntel.getSupplierSummary({ companyId: co, lookbackDays, useCache })
      ]);

      return buildBusinessSnapshotModel({
        companyId: co,
        generatedAt: new Date().toISOString(),
        lookbackDays,
        inventory, purchase, sales, pricing, supplier,
        recommendations: {
          inventory: inventory.recommendations,
          purchase: purchase.recommendations,
          sales: sales.recommendations,
          pricing: pricing.recommendations,
          supplier: supplier.recommendations
        },
        alerts: selectAlerts({ inventory, purchase, sales, pricing, supplier }),
        kpis: selectKpis({ inventory, purchase, sales, pricing, supplier })
      });
    });

    if (useCache) cache.set(co, cacheKey, result);
    return result;
  }

  return { getBusinessSnapshot };
}

/** The application-wide Business Snapshot Provider instance, wired to the real, shared Inventory/Purchase/Sales/Pricing/Supplier Intelligence singletons, shared cache, and shared diagnostics. */
export const businessSnapshotProvider = createBusinessSnapshotProvider();
