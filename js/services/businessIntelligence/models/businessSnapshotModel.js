// models/businessSnapshotModel.js (Milestone 12F)
// Structured, frozen response shape -- mirrors models/insightModels.js
// (12A), models/purchaseInsightModels.js (12B), models/salesInsightModels.js
// (12C), models/pricingInsightModels.js (12D), and models/supplierInsightModels.js
// (12E), all frozen: a new, sibling file in the same folder, not an edit to
// any of them. Does no calculation of its own -- only assembles
// already-computed pieces into one deep-frozen object.
//
// `inventory`/`purchase`/`sales`/`pricing`/`supplier` below are each domain's
// own already-frozen summary model (InventoryInsightModel, PurchaseSummaryModel,
// SalesSummaryModel, PricingSummaryModel, SupplierSummaryModel), embedded by
// REFERENCE, never copied or recomputed -- this is what "every section
// reuses existing intelligence models, never duplicate data" means in
// practice. `deepFreeze()` is a no-op on an already-frozen object
// (`shared/freezeDeep.js` checks `Object.isFrozen` first), so freezing this
// wrapper costs nothing extra for data already frozen by its own domain.

import { deepFreeze } from '../shared/freezeDeep.js';

/**
 * The company-wide Business Snapshot model -- the canonical, immutable
 * object representing the complete composed business state. Every
 * Dashboard Card reads from this object and nothing else.
 * @param {object} args
 * @param {string} args.companyId
 * @param {string} args.generatedAt ISO-8601, when THIS composed snapshot was assembled (distinct from, but close to, each embedded domain's own `generatedAt`)
 * @param {number} args.lookbackDays the window every embedded domain summary was computed over
 * @param {object} args.inventory InventoryInsightModel (12A), reused verbatim
 * @param {object} args.purchase PurchaseSummaryModel (12B), reused verbatim
 * @param {object} args.sales SalesSummaryModel (12C), reused verbatim
 * @param {object} args.pricing PricingSummaryModel (12D), reused verbatim
 * @param {object} args.supplier SupplierSummaryModel (12E), reused verbatim
 * @param {object} args.recommendations { inventory, purchase, sales, pricing, supplier } -- each domain's own already-computed `.recommendations` field, passed through unmodified
 * @param {object} args.alerts { inventory, purchase, sales, pricing, supplier } -- each domain's own already-computed recommendation rows, FILTERED to already-true warning/opportunity flags (a selection, not a calculation -- see dashboard/businessSnapshotProvider.js's own header comment)
 * @param {object} args.kpis a flat object of already-computed headline figures, plucked (not recomputed) from the five summaries above
 * @returns {object} the frozen BusinessSnapshot model
 */
export function buildBusinessSnapshotModel ({
  companyId, generatedAt, lookbackDays,
  inventory, purchase, sales, pricing, supplier,
  recommendations, alerts, kpis
}) {
  return deepFreeze({
    companyId,
    generatedAt,
    lookbackDays,
    inventory,
    purchase,
    sales,
    pricing,
    supplier,
    recommendations,
    alerts,
    kpis
  });
}
