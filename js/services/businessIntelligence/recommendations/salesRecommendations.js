// recommendations/salesRecommendations.js (Milestone 12C)
// Recommendations ONLY -- mirrors recommendations/reorderRecommendations.js
// (12A) and recommendations/purchaseRecommendations.js (12B), both frozen:
// this file never modifies ERP data, never generates an invoice, and never
// automates anything. Pure and calculators-only for the item-level
// recommendation (reuses calculators/purchaseTrendCalculator.js's
// COST_TREND enum verbatim, see metrics/salesMetrics.js's own header
// comment for why sales metrics keep that field name). The customer-level
// recommendation additionally takes small, precomputed, company-wide
// context values (companyAvgOrderValue, topCategories) as plain arguments
// -- never recomputing them itself, the same "caller supplies what it
// already computed elsewhere" discipline
// recommendations/purchaseRecommendations.js's supplierComparison
// parameter already established.

import { COST_TREND } from '../calculators/purchaseTrendCalculator.js';
import { SALES_DEFAULTS } from '../shared/config.js';

/**
 * @param {object} itemMetric one item metric from metrics/salesMetrics.js
 * @param {object} [opts] SALES_DEFAULTS overrides
 * @returns {object} a single item's sales recommendation
 */
export function buildItemSalesRecommendation (itemMetric, opts = {}) {
  const highDemandSalesPerYear = opts.highDemandSalesPerYear ?? SALES_DEFAULTS.highDemandSalesPerYear;
  const lowPerformingSalesPerYear = opts.lowPerformingSalesPerYear ?? SALES_DEFAULTS.lowPerformingSalesPerYear;

  const highDemand = itemMetric.salesFrequencyPerYear >= highDemandSalesPerYear;
  const decliningProduct = itemMetric.costTrend === COST_TREND.FALLING;
  const lowPerforming = itemMetric.salesFrequencyPerYear <= lowPerformingSalesPerYear;

  return {
    itemId: itemMetric.itemId,
    name: itemMetric.name,
    // "High Demand Items" and "Fast Selling Products" share one trigger
    // deliberately -- the same "two names for one signal" precedent
    // recommendations/purchaseRecommendations.js's bulkPurchaseOpportunity/
    // highFrequencyAlert pair already established.
    highDemandItem: highDemand,
    fastSellingProduct: highDemand,
    decliningProduct,
    productWithFallingRevenue: decliningProduct,
    // "Requires attention" is a composite of two already-computed signals,
    // not a new calculation -- declining AND rarely selling is more
    // actionable than either alone.
    productRequiresAttention: decliningProduct && lowPerforming
  };
}

/**
 * @param {object[]} salesMetricsList from metrics/salesMetrics.js
 * @param {object} [opts]
 * @returns {object[]} one recommendation per item
 */
export function buildItemSalesRecommendations (salesMetricsList, opts = {}) {
  return salesMetricsList.map((m) => buildItemSalesRecommendation(m, opts));
}

/**
 * @param {object} customerMetric one customer metric from metrics/customerMetrics.js
 * @param {{companyAvgOrderValue: number|null, topCategories: string[]}} context precomputed, company-wide (never recomputed here)
 * @param {object} [opts] SALES_DEFAULTS overrides
 * @returns {object} a single customer's recommendation
 */
export function buildCustomerRecommendation (customerMetric, { companyAvgOrderValue, topCategories }, opts = {}) {
  const retentionGapMultiplier = opts.retentionGapMultiplier ?? SALES_DEFAULTS.retentionGapMultiplier;
  const upsellBelowCompanyAvgPct = opts.upsellBelowCompanyAvgPct ?? SALES_DEFAULTS.upsellBelowCompanyAvgPct;

  const customerRetentionOpportunity = !!(
    customerMetric.daysSinceLastSale !== null &&
    customerMetric.avgDaysBetweenPurchases !== null &&
    customerMetric.daysSinceLastSale > customerMetric.avgDaysBetweenPurchases * retentionGapMultiplier
  );

  const upsellOpportunity = !!(
    customerMetric.avgOrderValue !== null &&
    companyAvgOrderValue !== null &&
    customerMetric.avgOrderValue < companyAvgOrderValue * (upsellBelowCompanyAvgPct / 100)
  );

  const crossSellCategories = (topCategories || []).filter((c) => !customerMetric.categories.includes(c));

  return {
    customerId: customerMetric.customerId,
    name: customerMetric.name,
    customerRetentionOpportunity,
    upsellOpportunity,
    crossSellOpportunity: crossSellCategories.length > 0,
    crossSellCategories
  };
}

/**
 * @param {object[]} customerMetricsList from metrics/customerMetrics.js
 * @param {{companyAvgOrderValue: number|null, topCategories: string[]}} context
 * @param {object} [opts]
 * @returns {object[]} one recommendation per customer
 */
export function buildCustomerRecommendations (customerMetricsList, context, opts = {}) {
  return customerMetricsList.map((m) => buildCustomerRecommendation(m, context, opts));
}
