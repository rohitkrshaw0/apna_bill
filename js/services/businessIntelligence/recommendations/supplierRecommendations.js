// recommendations/supplierRecommendations.js (Milestone 12E)
// Recommendations ONLY -- mirrors recommendations/reorderRecommendations.js
// (12A), recommendations/purchaseRecommendations.js (12B),
// recommendations/salesRecommendations.js (12C), and
// recommendations/pricingRecommendations.js (12D), all frozen: this file
// never modifies a supplier record, never places a purchase order, and
// never automates anything. Every recommendation is a deterministic
// threshold check, and per this milestone's own "Shared Calculation Rule",
// every threshold reused here is an EXISTING one -- no new
// SUPPLIER_DEFAULTS entry was needed beyond `concentrationRiskPct`
// (shared/config.js): `PURCHASE_DEFAULTS.highFrequencyPurchasesPerYear`/
// `lowFrequencyPurchasesPerYear` (12B), `PRICING_DEFAULTS.targetMarginPct`
// (12D), and `COST_TREND`/`PRICE_STABILITY` (12B/12D) are all reused
// verbatim, the same cross-domain threshold reuse
// recommendations/pricingRecommendations.js's own header comment documents
// for `SALES_DEFAULTS.lowPerformingSalesPerYear`.

import { COST_TREND } from '../calculators/purchaseTrendCalculator.js';
import { PRICE_STABILITY } from '../calculators/priceVolatilityCalculator.js';
import { PURCHASE_DEFAULTS, PRICING_DEFAULTS, SUPPLIER_DEFAULTS } from '../shared/config.js';

/**
 * @param {object} supplierMetric one supplier metric from
 *   metrics/supplierPerformanceMetrics.js, merged with its own
 *   `preferredItemCount` (aggregators/preferredSupplierCountAggregator.js --
 *   see api/supplierIntelligenceApi.js's own composition step for the merge)
 * @param {{totalPurchaseValue: number}} context precomputed, company-wide (never recomputed here)
 * @param {object} [opts] PURCHASE_DEFAULTS/PRICING_DEFAULTS/SUPPLIER_DEFAULTS overrides
 * @returns {object} a single supplier's recommendation
 */
export function buildSupplierRecommendation (supplierMetric, { totalPurchaseValue }, opts = {}) {
  const highFrequencyPurchasesPerYear = opts.highFrequencyPurchasesPerYear ?? PURCHASE_DEFAULTS.highFrequencyPurchasesPerYear;
  const lowFrequencyPurchasesPerYear = opts.lowFrequencyPurchasesPerYear ?? PURCHASE_DEFAULTS.lowFrequencyPurchasesPerYear;
  const targetMarginPct = opts.targetMarginPct ?? PRICING_DEFAULTS.targetMarginPct;
  const concentrationRiskPct = opts.concentrationRiskPct ?? SUPPLIER_DEFAULTS.concentrationRiskPct;

  const preferredItemCount = supplierMetric.preferredItemCount || 0;
  const preferredSupplier = preferredItemCount > 0;

  const lowPerformingSupplier = supplierMetric.purchaseFrequencyPerYear <= lowFrequencyPurchasesPerYear;
  const highPerformingSupplier = !!(
    supplierMetric.purchaseFrequencyPerYear >= highFrequencyPurchasesPerYear &&
    supplierMetric.costTrend !== COST_TREND.RISING &&
    supplierMetric.priceStability !== PRICE_STABILITY.VOLATILE
  );

  const priceIncreaseWarning = supplierMetric.costTrend === COST_TREND.RISING;

  // Rarely used AND never the cheapest option for anything they supply --
  // a composite of two already-computed signals, not a new calculation,
  // the same "composite recommendation" precedent
  // recommendations/salesRecommendations.js's own productRequiresAttention established.
  const supplierConsolidationOpportunity = lowPerformingSupplier && !preferredSupplier;

  const purchaseValueSharePct = totalPurchaseValue > 0 ? (supplierMetric.purchaseValue / totalPurchaseValue) * 100 : 0;
  const supplierDiversificationOpportunity = purchaseValueSharePct >= concentrationRiskPct;

  const highMarginSupplier = supplierMetric.marginContributionPct !== null && supplierMetric.marginContributionPct >= targetMarginPct;

  // Paying more while buying less, or a price history too inconsistent to
  // trust -- either signal alone is worth a manual review.
  const supplierReviewNeeded = !!(
    (priceIncreaseWarning && lowPerformingSupplier) ||
    supplierMetric.priceStability === PRICE_STABILITY.VOLATILE
  );

  return {
    supplierId: supplierMetric.supplierId,
    name: supplierMetric.name,
    preferredSupplier,
    highPerformingSupplier,
    lowPerformingSupplier,
    priceIncreaseWarning,
    supplierConsolidationOpportunity,
    supplierDiversificationOpportunity,
    highMarginSupplier,
    supplierReviewNeeded
  };
}

/**
 * @param {object[]} supplierMetricsList from metrics/supplierPerformanceMetrics.js (each merged with preferredItemCount)
 * @param {{totalPurchaseValue: number}} context
 * @param {object} [opts]
 * @returns {object[]} one recommendation per supplier
 */
export function buildSupplierRecommendations (supplierMetricsList, context, opts = {}) {
  return supplierMetricsList.map((m) => buildSupplierRecommendation(m, context, opts));
}
