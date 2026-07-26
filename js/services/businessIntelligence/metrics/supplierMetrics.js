// metrics/supplierMetrics.js
// Reusable, per-supplier purchase metrics (Milestone 12B). Pure function:
// takes the PurchaseSnapshot purchase/purchaseDataLoader.js already loaded
// and returns one metric object per supplier that was actually purchased
// from within the snapshot's window (the same "scoped to what's in the
// scan" semantics metrics/purchaseMetrics.js uses for items -- this is
// purchase HISTORY analysis, not a master supplier directory; that
// directory is js/suppliers.js's own job, untouched by this platform).

import { calculateSupplierSpend } from '../calculators/supplierSpendCalculator.js';
import { calculatePurchaseFrequency, annualizePurchaseFrequency } from '../calculators/purchaseFrequencyCalculator.js';
import { MS_PER_DAY } from '../shared/config.js';

function daysSince (isoDate, asOfDate) {
  if (!isoDate) return null;
  const diff = asOfDate.getTime() - new Date(isoDate).getTime();
  return diff >= 0 ? Math.floor(diff / MS_PER_DAY) : 0;
}

function latestBillDate (purchases) {
  let latest = null;
  for (const p of purchases) {
    if (p.billDate && (!latest || p.billDate > latest)) latest = p.billDate;
  }
  return latest;
}

/**
 * @param {import('../purchase/purchaseDataLoader.js').PurchaseSnapshot} snapshot
 * @returns {object[]} one metric object per supplier purchased from within the snapshot's window
 */
export function computeSupplierMetrics (snapshot) {
  const asOfDate = new Date(snapshot.generatedAt);
  const { lookbackDays } = snapshot;
  const supplierById = new Map(snapshot.suppliers.map((s) => [s.id, s]));

  return [...snapshot.purchasesBySupplier.keys()].map((supplierId) => {
    const purchases = snapshot.purchasesBySupplier.get(supplierId) || [];
    const supplier = supplierById.get(supplierId);
    const spend = calculateSupplierSpend(purchases);
    const lastPurchaseDate = latestBillDate(purchases);
    const purchaseFrequency = calculatePurchaseFrequency(purchases.length, lookbackDays);

    return {
      supplierId,
      name: supplier ? supplier.name : null,
      isActive: supplier ? supplier.isActive : null,

      purchaseCount: spend.totalCount,
      purchaseValue: spend.totalValue,
      avgOrderValue: spend.avgOrderValue,

      lastPurchaseDate,
      daysSinceLastPurchase: daysSince(lastPurchaseDate, asOfDate),

      purchaseFrequency,
      purchaseFrequencyPerYear: annualizePurchaseFrequency(purchaseFrequency)
    };
  });
}
