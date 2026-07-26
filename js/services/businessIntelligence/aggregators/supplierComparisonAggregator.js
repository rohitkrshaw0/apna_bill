// aggregators/supplierComparisonAggregator.js (Milestone 12B)
// Compares every supplier a given item was bought from, by price. Needs
// the raw, per-supplier purchase_line breakdown metrics/purchaseMetrics.js
// does not itself carry (that file aggregates across ALL suppliers per
// item) -- so this reads directly from the PurchaseSnapshot rather than
// from purchaseMetrics, the one aggregator in this milestone with that
// shape, and it says so explicitly rather than pretending to fit the
// "aggregators only consume metrics" mold when the data it needs isn't in
// the metrics layer. Reuses calculators/averagePriceCalculator.js's own
// functions -- never re-derives the price math itself.

import { calculateAvgPurchasePrice, calculateLastPurchasePrice } from '../calculators/averagePriceCalculator.js';

/**
 * @param {import('../purchase/purchaseDataLoader.js').PurchaseSnapshot} snapshot
 * @param {string} itemId
 * @returns {object[]} one row per supplier this item was bought from, cheapest avgPrice first
 */
export function aggregateSupplierComparison (snapshot, itemId) {
  const lines = snapshot.purchaseLinesByItem.get(itemId) || [];
  const supplierById = new Map(snapshot.suppliers.map((s) => [s.id, s]));

  const bySupplier = new Map();
  for (const line of lines) {
    if (!line.supplierId) continue;
    if (!bySupplier.has(line.supplierId)) bySupplier.set(line.supplierId, []);
    bySupplier.get(line.supplierId).push(line);
  }

  const rows = [];
  for (const [supplierId, supplierLines] of bySupplier) {
    rows.push({
      supplierId,
      supplierName: supplierById.get(supplierId)?.name ?? null,
      purchaseCount: supplierLines.length,
      totalQty: supplierLines.reduce((sum, l) => sum + (l.qty || 0), 0),
      avgPrice: calculateAvgPurchasePrice(supplierLines),
      lastPrice: calculateLastPurchasePrice(supplierLines)
    });
  }

  return rows.sort((a, b) => (a.avgPrice ?? Infinity) - (b.avgPrice ?? Infinity));
}
