// aggregators/worstSellingItemsAggregator.js (Milestone 12C)
// Serves both "Worst Selling Items" and "Low Performing Items" (the
// brief's own two bullets) -- one aggregator, not two, the same
// "one file can honestly cover two named bullets when the logic is
// identical" precedent aggregators/categoryPurchaseSummaryAggregator.js
// (12B) already set for "Category Purchase Summary"/"Highest Spend
// Categories". A new file, not a reuse of
// aggregators/topPurchasedItemsAggregator.js, because that function's sort
// direction is fixed descending -- inverting it is a different behavior,
// not achievable by calling the frozen function with different arguments.

/**
 * @param {object[]} salesMetricsList from metrics/salesMetrics.js
 * @param {{bottomN?: number, by?: 'netSales'|'unitsSold'|'salesFrequencyPerYear'}} [opts]
 * @returns {object[]} the bottomN items by the chosen field, ascending (worst first)
 */
export function aggregateWorstSellingItems (salesMetricsList, { bottomN = 10, by = 'netSales' } = {}) {
  return [...salesMetricsList]
    .sort((a, b) => (a[by] || 0) - (b[by] || 0))
    .slice(0, bottomN);
}
