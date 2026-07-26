// recommendations/purchaseRecommendations.js (Milestone 12B)
// Recommendations ONLY -- mirrors recommendations/reorderRecommendations.js's
// own permanent rule from 12A (frozen, unmodified by this milestone): this
// file never creates a purchase order, never updates a supplier record,
// and never automates anything. It returns a plain, structured suggestion
// a human decides what to do with.
//
// Pure and calculators-only, the same layering reorderRecommendations.js
// established: this file does not import from aggregators/ or call
// purchase/purchaseDataLoader.js itself. Per-supplier price comparison
// (needed for "preferred supplier"/"better cost opportunity") is computed
// once by aggregators/supplierComparisonAggregator.js and passed in --
// the caller (api/purchaseIntelligenceApi.js) is responsible for building
// that Map, so this file never re-derives a comparison itself.

import { COST_TREND } from '../calculators/purchaseTrendCalculator.js';
import { PURCHASE_DEFAULTS } from '../shared/config.js';

/**
 * @param {object} itemMetric one item metric from metrics/purchaseMetrics.js
 * @param {object[]} [supplierComparison] this item's aggregateSupplierComparison() rows, cheapest first (empty if never computed)
 * @param {object} [opts] PURCHASE_DEFAULTS overrides
 * @returns {object} a single item's purchase recommendation
 */
export function buildPurchaseRecommendation (itemMetric, supplierComparison = [], opts = {}) {
  const minSuppliersForConsolidation = opts.minSuppliersForConsolidation ?? PURCHASE_DEFAULTS.minSuppliersForConsolidation;
  const betterCostThresholdPct = opts.betterCostThresholdPct ?? PURCHASE_DEFAULTS.betterCostThresholdPct;
  const highFrequencyPurchasesPerYear = opts.highFrequencyPurchasesPerYear ?? PURCHASE_DEFAULTS.highFrequencyPurchasesPerYear;
  const lowFrequencyPurchasesPerYear = opts.lowFrequencyPurchasesPerYear ?? PURCHASE_DEFAULTS.lowFrequencyPurchasesPerYear;

  const preferredSupplier = supplierComparison.length ? supplierComparison[0] : null;
  const supplierConsolidationOpportunity = supplierComparison.length >= minSuppliersForConsolidation;

  const currentPrice = itemMetric.lastPurchasePrice ?? itemMetric.avgPurchasePrice;
  const betterCostOpportunity = !!(
    supplierComparison.length >= 2 &&
    preferredSupplier?.avgPrice != null &&
    currentPrice != null &&
    currentPrice > preferredSupplier.avgPrice * (1 + betterCostThresholdPct / 100)
  );

  const highFrequencyAlert = itemMetric.purchaseFrequencyPerYear >= highFrequencyPurchasesPerYear;
  const lowFrequencyAlert = itemMetric.purchaseFrequencyPerYear <= lowFrequencyPurchasesPerYear;

  return {
    itemId: itemMetric.itemId,
    name: itemMetric.name,
    preferredSupplier,
    supplierConsolidationOpportunity,
    betterCostOpportunity,
    // "Bulk Purchase Opportunity" and "High Purchase Frequency Alert" share
    // the same trigger deliberately -- frequent small purchases of the same
    // item is exactly the signal for both "buy less often, in bulk" and
    // "this item is being reordered a lot", not two independent conditions.
    bulkPurchaseOpportunity: highFrequencyAlert,
    priceIncreaseWarning: itemMetric.costTrend === COST_TREND.RISING,
    priceDropOpportunity: itemMetric.costTrend === COST_TREND.FALLING,
    highFrequencyAlert,
    lowFrequencyAlert
  };
}

/**
 * @param {object[]} purchaseMetricsList from metrics/purchaseMetrics.js
 * @param {Map<string, object[]>} supplierComparisonByItemId itemId -> aggregateSupplierComparison() rows
 * @param {object} [opts]
 * @returns {object[]} one recommendation per item
 */
export function buildPurchaseRecommendations (purchaseMetricsList, supplierComparisonByItemId, opts = {}) {
  return purchaseMetricsList.map((m) => buildPurchaseRecommendation(m, supplierComparisonByItemId.get(m.itemId) || [], opts));
}
