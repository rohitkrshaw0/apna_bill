// aggregators/customerRankingAggregator.js (Milestone 12C)
// A thin, single-line delegation to aggregators/supplierRankingAggregator.js
// (12B, frozen) -- that function's own logic
// (`[...list].sort((a,b) => (b[by]||0) - (a[by]||0))`) is already 100%
// generic over any metric list and field name; it happens to live in a
// file named for suppliers only because 12B built it first. Renaming that
// file/export is forbidden (frozen, no API renames) -- this wrapper gives
// Sales Intelligence's own public API a domain-appropriate name with ZERO
// new ranking logic, the same "generalize by composition" pattern
// calculators/purchaseFrequencyCalculator.js (12B) already established for
// calculateDailySalesVelocity().

import { aggregateSupplierRanking } from './supplierRankingAggregator.js';

/**
 * @param {object[]} customerMetricsList from metrics/customerMetrics.js
 * @param {{by?: 'totalSalesValue'|'orderCount'|'avgOrderValue'}} [opts]
 * @returns {object[]} customers ranked descending by the chosen field
 */
export function aggregateCustomerRanking (customerMetricsList, { by = 'totalSalesValue' } = {}) {
  return aggregateSupplierRanking(customerMetricsList, { by });
}
