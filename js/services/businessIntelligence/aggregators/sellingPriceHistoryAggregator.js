// aggregators/sellingPriceHistoryAggregator.js (Milestone 12D)
// Chronological selling-price history for one item -- shape only, no
// calculation. Mirrors aggregators/costHistoryAggregator.js (12B, frozen)
// exactly, but cannot reuse it verbatim: that function reads
// PurchaseSnapshot's own `purchaseLinesByItem`/`purchaseId`/`supplierId`
// field names, and this reads SalesSnapshot's `invoiceLinesByItem`/
// `invoiceId`/`partyId` instead -- a genuinely different snapshot shape,
// not achievable by calling the frozen function with different arguments
// (the same "new file, not a forced reuse" call
// aggregators/worstSellingItemsAggregator.js's own header comment makes).

/**
 * @param {import('../sales/salesDataLoader.js').SalesSnapshot} snapshot
 * @param {string} itemId
 * @returns {object[]} {date, rate, qty, invoiceId, customerId} rows, oldest first, sale lines only (returns excluded)
 */
export function aggregateSellingPriceHistory (snapshot, itemId) {
  const lines = (snapshot.invoiceLinesByItem.get(itemId) || []).filter((l) => l.docType === 'sale');
  return lines
    .filter((l) => l.invoiceDate)
    .slice()
    .sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate))
    .map((l) => ({ date: l.invoiceDate, rate: l.rate, qty: l.qty, invoiceId: l.invoiceId, customerId: l.partyId }));
}
