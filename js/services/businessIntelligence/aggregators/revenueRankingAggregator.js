// aggregators/revenueRankingAggregator.js (Milestone 12C)
// Same reuse-by-delegation pattern as customerRankingAggregator.js in this
// same milestone -- see that file's own header comment.

import { aggregateSupplierRanking } from './supplierRankingAggregator.js';

/**
 * @param {object[]} salesMetricsList from metrics/salesMetrics.js
 * @param {{by?: 'netSales'|'unitsSold'|'grossMargin'}} [opts]
 * @returns {object[]} items ranked descending by the chosen revenue-related field
 */
export function aggregateRevenueRanking (salesMetricsList, { by = 'netSales' } = {}) {
  return aggregateSupplierRanking(salesMetricsList, { by });
}
