// aggregators/salesSummaryAggregator.js (Milestone 12C)
// Combines every other sales aggregator's output into one company-wide
// totals object -- never re-derives a predicate itself, the same
// composition rule aggregators/inventorySummaryAggregator.js (12A) and
// aggregators/purchaseSummaryAggregator.js (12B), both frozen, already
// established. Reuses aggregators/purchaseTrendSummaryAggregator.js (12B)
// VERBATIM -- see metrics/salesMetrics.js's own header comment for why
// that's safe (the `costTrend` field name is shared deliberately).

import { aggregatePurchaseTrendSummary } from './purchaseTrendSummaryAggregator.js';
import { aggregateSalesFrequencySummary } from './salesFrequencySummaryAggregator.js';

/**
 * @param {object[]} salesMetricsList from metrics/salesMetrics.js
 * @param {object[]} customerMetricsList from metrics/customerMetrics.js
 * @param {object} [opts] forwarded to aggregateSalesFrequencySummary
 */
export function aggregateSalesSummary (salesMetricsList, customerMetricsList, opts = {}) {
  const totalUnitsSold = salesMetricsList.reduce((sum, m) => sum + m.unitsSold, 0);
  const totalGrossSales = salesMetricsList.reduce((sum, m) => sum + m.grossSales, 0);
  const totalReturnsValue = salesMetricsList.reduce((sum, m) => sum + m.returnsValue, 0);
  const totalNetSales = salesMetricsList.reduce((sum, m) => sum + m.netSales, 0);
  const totalGrossMargin = salesMetricsList.reduce((sum, m) => sum + m.grossMargin, 0);
  const totalMarginableRevenue = salesMetricsList.reduce((sum, m) => sum + m.marginableRevenue, 0);

  const trendSummary = aggregatePurchaseTrendSummary(salesMetricsList);
  const itemFrequencySummary = aggregateSalesFrequencySummary(salesMetricsList, opts);
  const customerFrequencySummary = aggregateSalesFrequencySummary(customerMetricsList, opts);

  return {
    itemCount: salesMetricsList.length,
    customerCount: customerMetricsList.length,
    totalUnitsSold,
    totalGrossSales,
    totalReturnsValue,
    totalNetSales,
    avgSellingPrice: totalUnitsSold > 0 ? totalNetSales / totalUnitsSold : null,
    overallGrossMarginPct: totalMarginableRevenue > 0 ? (totalGrossMargin / totalMarginableRevenue) * 100 : null,
    risingCount: trendSummary.risingCount,
    fallingCount: trendSummary.fallingCount,
    stableCount: trendSummary.stableCount,
    highDemandItemCount: itemFrequencySummary.highDemandCount,
    lowPerformingItemCount: itemFrequencySummary.lowPerformingCount,
    highDemandCustomerCount: customerFrequencySummary.highDemandCount,
    lowPerformingCustomerCount: customerFrequencySummary.lowPerformingCount
  };
}
