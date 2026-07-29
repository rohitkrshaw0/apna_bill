// metrics/customerMetrics.js (Milestone 12C)
// Reusable, per-customer sales metrics. Mirrors metrics/supplierMetrics.js's
// (12B, frozen) own role -- one metric object per customer who actually
// bought something within the snapshot's window (purchase-history-scoped,
// not a master customer directory -- that remains a future Customer
// Management concern, same boundary 12B's own supplierMetrics.js already
// drew for suppliers).
//
// DEEP REUSE: calculators/supplierSpendCalculator.js's calculateSupplierSpend()
// is already fully generic (it only ever reads `.grandTotal` off a list of
// "purchase-like" records) -- reused here VERBATIM against a customer's own
// sale invoices, not copied into a new "customerSpendCalculator.js".
// calculators/purchaseFrequencyCalculator.js's calculatePurchaseFrequency-
// adjacent calculateDailySalesVelocity()/annualizePurchaseFrequency()/
// calculateAvgDaysBetweenPurchases() are reused the same way.

import { calculateSupplierSpend } from '../calculators/supplierSpendCalculator.js';
import { calculateDailySalesVelocity } from '../calculators/turnoverCalculator.js';
import { annualizePurchaseFrequency, calculateAvgDaysBetweenPurchases } from '../calculators/purchaseFrequencyCalculator.js';
import { resolveCategory } from '../calculators/categoryCalculator.js';
import { MS_PER_DAY } from '../shared/config.js';

function daysSince (isoDate, asOfDate) {
  if (!isoDate) return null;
  const diff = asOfDate.getTime() - new Date(isoDate).getTime();
  return diff >= 0 ? Math.floor(diff / MS_PER_DAY) : 0;
}

function latestSaleDate (invoices) {
  let latest = null;
  for (const i of invoices) {
    if (i.invoiceDate && (!latest || i.invoiceDate > latest)) latest = i.invoiceDate;
  }
  return latest;
}

/**
 * @param {import('../sales/salesDataLoader.js').SalesSnapshot} snapshot
 * @returns {object[]} one metric object per customer who bought within the snapshot's window
 */
export function computeCustomerMetrics (snapshot) {
  const asOfDate = new Date(snapshot.generatedAt);
  const { lookbackDays } = snapshot;
  const customerById = new Map(snapshot.customers.map((c) => [c.id, c]));

  return [...snapshot.invoicesByCustomer.keys()].map((customerId) => {
    const allInvoices = snapshot.invoicesByCustomer.get(customerId) || [];
    const saleInvoices = allInvoices.filter((i) => i.docType === 'sale');
    const customer = customerById.get(customerId);
    const spend = calculateSupplierSpend(saleInvoices);
    const lastSaleDate = latestSaleDate(saleInvoices);
    const salesFrequency = calculateDailySalesVelocity(saleInvoices.length, lookbackDays);

    const invoiceDatesAscending = [...new Set(saleInvoices.map((i) => i.invoiceDate).filter(Boolean))].sort();

    const lines = snapshot.invoiceLinesByCustomer.get(customerId) || [];
    const categories = [...new Set(lines.map((l) => resolveCategory({ hsnSac: l.hsnSac })))];

    return {
      customerId,
      name: customer ? customer.name : null,
      isActive: customer ? customer.isActive : null,

      orderCount: spend.totalCount,
      totalSalesValue: spend.totalValue,
      avgOrderValue: spend.avgOrderValue,

      lastSaleDate,
      daysSinceLastSale: daysSince(lastSaleDate, asOfDate),
      avgDaysBetweenPurchases: calculateAvgDaysBetweenPurchases(invoiceDatesAscending),

      salesFrequency,
      salesFrequencyPerYear: annualizePurchaseFrequency(salesFrequency),

      categories
    };
  });
}
