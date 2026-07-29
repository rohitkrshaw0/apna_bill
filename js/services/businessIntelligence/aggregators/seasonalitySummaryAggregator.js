// aggregators/seasonalitySummaryAggregator.js (Milestone 12C)
// Genuinely new: no existing aggregator in this platform buckets anything
// by calendar month -- Inventory/Purchase Intelligence's own "trend"
// concept splits a window into two halves (recent/older), not a
// month-by-month series. Reads the raw SalesSnapshot directly (not a
// metrics array) for the same disclosed reason
// aggregators/supplierComparisonAggregator.js (12B) does: the per-month
// breakdown isn't something metrics/salesMetrics.js aggregates into its
// own per-item rows.

/** @param {string} isoDate YYYY-MM-DD @returns {string} YYYY-MM */
function monthOf (isoDate) {
  return isoDate.slice(0, 7);
}

/**
 * @param {import('../sales/salesDataLoader.js').SalesSnapshot} snapshot
 * @returns {object[]} one row per calendar month with any activity in the window, chronological (oldest first): { month, netSales, unitsSold, orderCount }
 */
export function aggregateSeasonalitySummary (snapshot) {
  const byMonth = new Map();

  function bucket (month) {
    if (!byMonth.has(month)) byMonth.set(month, { month, netSales: 0, unitsSold: 0, orderCount: 0 });
    return byMonth.get(month);
  }

  for (const line of snapshot.invoiceLines) {
    if (!line.invoiceDate) continue;
    const row = bucket(monthOf(line.invoiceDate));
    const sign = line.docType === 'sale_return' ? -1 : 1;
    row.netSales += sign * (line.lineTotal || 0);
    row.unitsSold += sign * (line.qty || 0);
  }

  for (const invoice of snapshot.invoices) {
    if (!invoice.invoiceDate || invoice.docType !== 'sale') continue;
    bucket(monthOf(invoice.invoiceDate)).orderCount += 1;
  }

  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}
