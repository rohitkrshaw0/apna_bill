// aggregators/preferredSupplierCountAggregator.js (Milestone 12E)
// "Which supplier is the cheapest most often" -- reuses
// aggregators/preferredSupplierAggregator.js (12B, frozen) VERBATIM, once
// per item, and tallies which supplier wins each time. No new price
// comparison logic; this file only counts an already-computed result.

import { aggregatePreferredSupplier } from './preferredSupplierAggregator.js';

/**
 * @param {import('../purchase/purchaseDataLoader.js').PurchaseSnapshot} purchaseSnapshot
 * @returns {Map<string, number>} supplierId -> number of items for which this supplier is the cheapest (preferred) source
 */
export function aggregatePreferredSupplierCounts (purchaseSnapshot) {
  const counts = new Map();
  for (const itemId of purchaseSnapshot.purchaseLinesByItem.keys()) {
    const preferred = aggregatePreferredSupplier(purchaseSnapshot, itemId);
    if (!preferred) continue;
    counts.set(preferred.supplierId, (counts.get(preferred.supplierId) || 0) + 1);
  }
  return counts;
}
