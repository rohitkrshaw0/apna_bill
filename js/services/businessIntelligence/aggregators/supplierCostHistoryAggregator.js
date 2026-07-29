// aggregators/supplierCostHistoryAggregator.js (Milestone 12E)
// Chronological purchase price history for ONE SUPPLIER across every item
// they've supplied -- shape only, no calculation. Mirrors
// aggregators/costHistoryAggregator.js (12B, frozen) exactly, but cannot
// reuse it verbatim: that function groups by itemId
// (`purchaseLinesByItem`), this groups by supplierId instead -- the same
// "new file, not a forced reuse" call
// aggregators/sellingPriceHistoryAggregator.js's own 12D header comment
// made for an analogous, differently-keyed mirror.

/**
 * @param {import('../purchase/purchaseDataLoader.js').PurchaseSnapshot} snapshot
 * @param {string} supplierId
 * @returns {object[]} {date, rate, qty, itemId, purchaseId} rows, oldest first, across every item this supplier has supplied
 */
export function aggregateSupplierCostHistory (snapshot, supplierId) {
  const lines = snapshot.purchaseLines.filter((l) => l.supplierId === supplierId);
  return lines
    .filter((l) => l.billDate)
    .slice()
    .sort((a, b) => a.billDate.localeCompare(b.billDate))
    .map((l) => ({ date: l.billDate, rate: l.rate, qty: l.qty, itemId: l.itemId, purchaseId: l.purchaseId }));
}
