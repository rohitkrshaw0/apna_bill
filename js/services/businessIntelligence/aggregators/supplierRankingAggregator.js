// aggregators/supplierRankingAggregator.js (Milestone 12B)

/**
 * @param {object[]} supplierMetricsList from metrics/supplierMetrics.js
 * @param {{by?: 'purchaseValue'|'purchaseCount'|'avgOrderValue'}} [opts]
 * @returns {object[]} suppliers ranked descending by the chosen field
 */
export function aggregateSupplierRanking (supplierMetricsList, { by = 'purchaseValue' } = {}) {
  return [...supplierMetricsList].sort((a, b) => (b[by] || 0) - (a[by] || 0));
}
