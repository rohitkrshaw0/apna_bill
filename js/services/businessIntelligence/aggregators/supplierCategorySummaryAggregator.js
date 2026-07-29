// aggregators/supplierCategorySummaryAggregator.js (Milestone 12E)
// Same pattern as every prior domain's own category aggregator (12A's
// categorySummaryAggregator.js, 12B's categoryPurchaseSummaryAggregator.js,
// 12C's categorySalesSummaryAggregator.js, 12D's
// categoryPricingSummaryAggregator.js, all frozen) -- a new, small,
// sibling file, because each reduces over that domain's own field names.
// Groups suppliers by their OWN dominant category (the first entry of
// their own `categoryDistribution`, already sorted highest-item-count-first
// by metrics/supplierPerformanceMetrics.js) -- a supplier can supply many
// categories, so "dominant category" is the one this supplier is most
// associated with, not an exclusive assignment.

import { UNCATEGORIZED } from '../calculators/categoryCalculator.js';

/**
 * @param {object[]} supplierPerformanceMetricsList from metrics/supplierPerformanceMetrics.js
 * @returns {object[]} one row per dominant category, highest supplier count first
 */
export function aggregateSupplierCategorySummary (supplierPerformanceMetricsList) {
  const byCategory = new Map();

  for (const supplier of supplierPerformanceMetricsList) {
    const dominant = supplier.categoryDistribution[0]?.category || UNCATEGORIZED;
    if (!byCategory.has(dominant)) byCategory.set(dominant, []);
    byCategory.get(dominant).push(supplier);
  }

  const rows = [];
  for (const [category, suppliers] of byCategory) {
    rows.push({
      category,
      supplierCount: suppliers.length,
      totalRevenueContribution: suppliers.reduce((sum, s) => sum + s.revenueContribution, 0),
      totalPurchaseValue: suppliers.reduce((sum, s) => sum + s.purchaseValue, 0)
    });
  }

  return rows.sort((a, b) => b.supplierCount - a.supplierCount);
}
