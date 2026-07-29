// metrics/salesMetrics.js (Milestone 12C)
// Reusable, per-item sales metrics. Mirrors metrics/purchaseMetrics.js's
// (12B, frozen) own role -- one metric object per item actually sold
// within the snapshot's window, computed once, reused by every aggregator
// downstream.
//
// DEEP REUSE, not duplication -- see the milestone's own "Reuse Audit"
// (docs/reports/milestone-12c-completion.md): every price/trend/frequency
// number below is computed by calling 12B's own calculators VERBATIM,
// unmodified, never re-implemented:
//   - calculators/averagePriceCalculator.js's four price-stat functions
//     are already domain-agnostic (they only ever read `.qty`/`.rate`/
//     `.billDate` off a line object) -- this is exactly why
//     sales/salesDataLoader.js attaches a `billDate` alias (equal to
//     `invoiceDate`) onto every enriched line: so these functions work
//     completely unmodified on sale lines, not just purchase lines.
//   - calculators/purchaseTrendCalculator.js's calculateRollingPurchaseAverage()
//     and calculateCostTrend() (+ its COST_TREND enum) are reused the same
//     way, for the same reason. The output field is deliberately still
//     named `costTrend` (not `salesTrend`) specifically so
//     aggregators/purchaseTrendSummaryAggregator.js (12B, frozen) can be
//     reused VERBATIM for sales too (see aggregators/ -- no
//     salesTrendSummaryAggregator.js file exists, by design).
//   - calculators/turnoverCalculator.js's calculateDailySalesVelocity() is
//     reused for BOTH sales frequency (transaction count / day) and sales
//     velocity (net units / day) -- this function was already named
//     "Sales Velocity" when 12A built it for Inventory Intelligence, and
//     genuinely is the exact same math this milestone needs.
//   - calculators/purchaseFrequencyCalculator.js's annualizePurchaseFrequency()
//     is reused verbatim to annualize both of the above.
//   - calculators/categoryCalculator.js's resolveCategory() is reused
//     verbatim (hsn_sac proxy, same as 12A/12B).
// Only calculators/revenueCalculator.js (gross/net/returns/return-rate) and
// calculators/marginCalculator.js (gross margin) are genuinely new --
// no existing calculator in this platform distinguishes a document's own
// docType or compares a selling price against a cost basis.

import { calculateAvgPurchasePrice, calculateLastPurchasePrice, calculateHighestPurchasePrice, calculateLowestPurchasePrice } from '../calculators/averagePriceCalculator.js';
import { calculateRollingPurchaseAverage, calculateCostTrend } from '../calculators/purchaseTrendCalculator.js';
import { calculateDailySalesVelocity } from '../calculators/turnoverCalculator.js';
import { annualizePurchaseFrequency } from '../calculators/purchaseFrequencyCalculator.js';
import { resolveCategory } from '../calculators/categoryCalculator.js';
import { calculateGrossSales, calculateReturnsValue, calculateNetSales, calculateNetUnitsSold, calculateReturnRate } from '../calculators/revenueCalculator.js';
import { calculateGrossMargin } from '../calculators/marginCalculator.js';
import { MS_PER_DAY } from '../shared/config.js';

function daysSince (isoDate, asOfDate) {
  if (!isoDate) return null;
  const diff = asOfDate.getTime() - new Date(isoDate).getTime();
  return diff >= 0 ? Math.floor(diff / MS_PER_DAY) : 0;
}

function latestSaleDate (lines) {
  let latest = null;
  for (const l of lines) {
    if (l.docType === 'sale' && l.invoiceDate && (!latest || l.invoiceDate > latest)) latest = l.invoiceDate;
  }
  return latest;
}

/**
 * @param {import('../sales/salesDataLoader.js').SalesSnapshot} snapshot
 * @param {object} [opts] forwarded to calculateRollingPurchaseAverage/calculateCostTrend (rollingAverageWindow, trendThresholdPct -- see shared/config.js's PURCHASE_DEFAULTS, reused for sales too)
 * @returns {object[]} one metric object per item sold or returned within the snapshot's window
 */
export function computeSalesMetrics (snapshot, opts = {}) {
  const asOfDate = new Date(snapshot.generatedAt);
  const { lookbackDays } = snapshot;

  const itemIds = [...snapshot.invoiceLinesByItem.keys()];

  return itemIds.map((itemId) => {
    const lines = snapshot.invoiceLinesByItem.get(itemId) || [];
    const saleLines = lines.filter((l) => l.docType === 'sale');
    const firstLine = lines[0];

    const netUnitsSold = calculateNetUnitsSold(lines);
    const netSales = calculateNetSales(lines);
    const lastSaleDate = latestSaleDate(lines);

    const salesFrequency = calculateDailySalesVelocity(saleLines.length, lookbackDays);
    const salesVelocity = calculateDailySalesVelocity(netUnitsSold, lookbackDays);
    const margin = calculateGrossMargin(saleLines);
    const trend = calculateCostTrend(saleLines, { asOfDate, lookbackDays, ...opts });

    return {
      itemId,
      name: firstLine ? firstLine.itemName : null,
      category: resolveCategory({ hsnSac: firstLine ? firstLine.hsnSac : null }),

      grossSales: calculateGrossSales(lines),
      returnsValue: calculateReturnsValue(lines),
      netSales,
      revenue: netSales,
      unitsSold: netUnitsSold,
      returnRate: calculateReturnRate(lines),

      avgSellingPrice: calculateAvgPurchasePrice(saleLines),
      lastSellingPrice: calculateLastPurchasePrice(saleLines),
      highestSellingPrice: calculateHighestPurchasePrice(saleLines),
      lowestSellingPrice: calculateLowestPurchasePrice(saleLines),
      rollingAvgSellingPrice: calculateRollingPurchaseAverage(saleLines, opts),

      lastSaleDate,
      daysSinceLastSale: daysSince(lastSaleDate, asOfDate),

      salesFrequency,
      salesFrequencyPerYear: annualizePurchaseFrequency(salesFrequency),
      salesVelocity,
      salesVelocityPerYear: annualizePurchaseFrequency(salesVelocity),

      // Deliberately named `costTrend` (not `salesTrend`) -- see this
      // file's own header comment for why: it lets
      // aggregators/purchaseTrendSummaryAggregator.js be reused verbatim.
      costTrend: trend.trend,
      costTrendChangePct: trend.changePct,
      recentAvgPrice: trend.recentAvgPrice,
      olderAvgPrice: trend.olderAvgPrice,

      marginableRevenue: margin.marginableRevenue,
      grossMargin: margin.grossMargin,
      grossMarginPct: margin.grossMarginPct
    };
  });
}
