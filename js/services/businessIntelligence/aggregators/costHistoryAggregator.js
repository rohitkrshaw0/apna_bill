// aggregators/costHistoryAggregator.js (Milestone 12B)
// Chronological price history for one item -- shape only, no calculation.

/**
 * @param {import('../purchase/purchaseDataLoader.js').PurchaseSnapshot} snapshot
 * @param {string} itemId
 * @returns {object[]} {date, rate, qty, purchaseId, supplierId} rows, oldest first
 */
export function aggregateCostHistory (snapshot, itemId) {
  const lines = snapshot.purchaseLinesByItem.get(itemId) || [];
  return lines
    .filter((l) => l.billDate)
    .slice()
    .sort((a, b) => a.billDate.localeCompare(b.billDate))
    .map((l) => ({ date: l.billDate, rate: l.rate, qty: l.qty, purchaseId: l.purchaseId, supplierId: l.supplierId }));
}
