// recommendations/pricingRecommendations.js (Milestone 12D)
// Recommendations ONLY -- mirrors recommendations/reorderRecommendations.js
// (12A), recommendations/purchaseRecommendations.js (12B), and
// recommendations/salesRecommendations.js (12C), all frozen: this file
// never modifies a price, never updates ERP data, and never automates
// anything. Every recommendation is a deterministic threshold check
// against metrics/pricingMetrics.js's own already-computed fields -- no
// new calculation, no AI, no prediction model, per this milestone's own
// "Recommendations must be deterministic" rule.

import { PRICE_STABILITY } from '../calculators/priceVolatilityCalculator.js';
import { COST_TREND } from '../calculators/purchaseTrendCalculator.js';
import { PRICING_DEFAULTS, SALES_DEFAULTS } from '../shared/config.js';

/**
 * @param {object} pricingMetric one item metric from metrics/pricingMetrics.js
 * @param {object} [opts] PRICING_DEFAULTS overrides, plus lowPerformingSalesPerYear (reused from SALES_DEFAULTS -- see below)
 * @returns {object} a single item's pricing recommendation
 */
export function buildPricingRecommendation (pricingMetric, opts = {}) {
  const targetMarginPct = opts.targetMarginPct ?? PRICING_DEFAULTS.targetMarginPct;
  const lowMarginThresholdPct = opts.lowMarginThresholdPct ?? PRICING_DEFAULTS.lowMarginThresholdPct;
  const highDiscountThresholdPct = opts.highDiscountThresholdPct ?? PRICING_DEFAULTS.highDiscountThresholdPct;
  // "Low sales frequency" reuses SALES_DEFAULTS.lowPerformingSalesPerYear
  // rather than a new PRICING_DEFAULTS entry -- the same cross-domain
  // threshold reuse shared/config.js's own SALES_DEFAULTS header comment
  // already documents for Sales Intelligence reusing PURCHASE_DEFAULTS.
  const lowPerformingSalesPerYear = opts.lowPerformingSalesPerYear ?? SALES_DEFAULTS.lowPerformingSalesPerYear;

  const hasMargin = pricingMetric.marginPct !== null;

  const lowMarginWarning = hasMargin && pricingMetric.marginPct <= lowMarginThresholdPct;
  const highDiscountWarning = pricingMetric.avgDiscountPct !== null && pricingMetric.avgDiscountPct >= highDiscountThresholdPct;
  // Margin below target and the selling price isn't already rising --
  // room to raise the price without contradicting an existing upward move.
  const priceIncreaseOpportunity = hasMargin && pricingMetric.marginPct < targetMarginPct &&
    pricingMetric.sellingPriceTrend !== COST_TREND.RISING;
  // Healthy-or-better margin but rarely selling -- a lower price could
  // stimulate demand without an already-thin margin turning negative.
  const priceReductionOpportunity = hasMargin && pricingMetric.marginPct >= targetMarginPct &&
    pricingMetric.salesFrequencyPerYear !== null && pricingMetric.salesFrequencyPerYear <= lowPerformingSalesPerYear;
  const priceConsistencyWarning = pricingMetric.priceStability === PRICE_STABILITY.VOLATILE;
  const supplierCostIncreaseAlert = pricingMetric.purchasePriceTrend === COST_TREND.RISING;

  return {
    itemId: pricingMetric.itemId,
    name: pricingMetric.name,
    lowMarginWarning,
    highDiscountWarning,
    priceIncreaseOpportunity,
    priceReductionOpportunity,
    priceConsistencyWarning,
    supplierCostIncreaseAlert
  };
}

/**
 * @param {object[]} pricingMetricsList from metrics/pricingMetrics.js
 * @param {object} [opts]
 * @returns {object[]} one recommendation per item
 */
export function buildPricingRecommendations (pricingMetricsList, opts = {}) {
  return pricingMetricsList.map((m) => buildPricingRecommendation(m, opts));
}
