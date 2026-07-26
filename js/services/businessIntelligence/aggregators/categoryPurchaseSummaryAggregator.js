// aggregators/categoryPurchaseSummaryAggregator.js (Milestone 12B)
// Reuses calculators/categoryCalculator.js's groupMetricsByCategory() as-is
// (frozen, unmodified by this milestone) -- the same hsn_sac category
// proxy 12A's own categorySummaryAggregator.js uses, applied here to
// purchase metrics instead of inventory metrics. Sorted highest spend
// first, which doubles as "Highest Spend Categories" (the brief's own
// separate bullet) -- no second aggregator needed for that.

import { groupMetricsByCategory } from '../calculators/categoryCalculator.js';

/**
 * @param {object[]} purchaseMetricsList from metrics/purchaseMetrics.js
 * @returns {object[]} one row per category, highest totalPurchaseValue first
 */
export function aggregateCategoryPurchaseSummary (purchaseMetricsList) {
  const grouped = groupMetricsByCategory(purchaseMetricsList);
  const rows = [];

  for (const [category, items] of grouped) {
    const totalPurchaseQty = items.reduce((sum, m) => sum + m.purchaseQty, 0);
    const totalPurchaseValue = items.reduce((sum, m) => sum + m.purchaseValue, 0);

    rows.push({
      category,
      itemCount: items.length,
      totalPurchaseQty,
      totalPurchaseValue,
      avgPurchasePrice: totalPurchaseQty > 0 ? totalPurchaseValue / totalPurchaseQty : null
    });
  }

  return rows.sort((a, b) => b.totalPurchaseValue - a.totalPurchaseValue);
}
