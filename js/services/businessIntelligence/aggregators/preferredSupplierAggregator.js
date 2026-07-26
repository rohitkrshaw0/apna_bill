// aggregators/preferredSupplierAggregator.js (Milestone 12B)
// Reuses aggregateSupplierComparison()'s own already-sorted (cheapest
// first) output -- never re-derives the per-supplier price comparison.

import { aggregateSupplierComparison } from './supplierComparisonAggregator.js';

/**
 * @param {import('../purchase/purchaseDataLoader.js').PurchaseSnapshot} snapshot
 * @param {string} itemId
 * @returns {object|null} the lowest-avg-price supplier for this item, or null if never purchased from a known supplier
 */
export function aggregatePreferredSupplier (snapshot, itemId) {
  const comparison = aggregateSupplierComparison(snapshot, itemId);
  return comparison.length ? comparison[0] : null;
}
