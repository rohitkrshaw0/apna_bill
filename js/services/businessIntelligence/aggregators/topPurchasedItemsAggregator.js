// aggregators/topPurchasedItemsAggregator.js (Milestone 12B)

/**
 * @param {object[]} purchaseMetricsList from metrics/purchaseMetrics.js
 * @param {{topN?: number, by?: 'purchaseValue'|'purchaseQty'|'purchaseCount'}} [opts]
 * @returns {object[]} the topN items by the chosen field, descending
 */
export function aggregateTopPurchasedItems (purchaseMetricsList, { topN = 10, by = 'purchaseValue' } = {}) {
  return [...purchaseMetricsList]
    .sort((a, b) => (b[by] || 0) - (a[by] || 0))
    .slice(0, topN);
}
