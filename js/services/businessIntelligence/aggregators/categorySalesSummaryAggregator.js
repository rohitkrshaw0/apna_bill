// aggregators/categorySalesSummaryAggregator.js (Milestone 12C)
// Same pattern as 12A's categorySummaryAggregator.js and 12B's
// categoryPurchaseSummaryAggregator.js (both frozen) -- a new, small,
// sibling file rather than a modification of either, because each reduces
// over that domain's own field names (`purchaseValue` vs `netSales`, etc.),
// which the frozen files cannot be changed to accommodate. All three reuse
// calculators/categoryCalculator.js's groupMetricsByCategory() verbatim.

import { groupMetricsByCategory } from '../calculators/categoryCalculator.js';

/**
 * @param {object[]} salesMetricsList from metrics/salesMetrics.js
 * @returns {object[]} one row per category, highest net sales first
 */
export function aggregateCategorySalesSummary (salesMetricsList) {
  const grouped = groupMetricsByCategory(salesMetricsList);
  const rows = [];

  for (const [category, items] of grouped) {
    const totalUnitsSold = items.reduce((sum, m) => sum + m.unitsSold, 0);
    const totalNetSales = items.reduce((sum, m) => sum + m.netSales, 0);

    rows.push({
      category,
      itemCount: items.length,
      totalUnitsSold,
      totalNetSales,
      avgSellingPrice: totalUnitsSold > 0 ? totalNetSales / totalUnitsSold : null
    });
  }

  return rows.sort((a, b) => b.totalNetSales - a.totalNetSales);
}
