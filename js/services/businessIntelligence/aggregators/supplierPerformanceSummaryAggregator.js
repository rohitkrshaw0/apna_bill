// aggregators/supplierPerformanceSummaryAggregator.js (Milestone 12E)
// Combines every other supplier aggregator's output into one company-wide
// totals object -- never re-derives a predicate itself, the same
// composition rule aggregators/inventorySummaryAggregator.js (12A),
// aggregators/purchaseSummaryAggregator.js (12B),
// aggregators/salesSummaryAggregator.js (12C), and
// aggregators/pricingSummaryAggregator.js (12D), all frozen, already
// established. Reuses aggregators/purchaseTrendSummaryAggregator.js and
// aggregators/purchaseFrequencySummaryAggregator.js (both 12B, frozen)
// VERBATIM -- `metrics/supplierPerformanceMetrics.js` deliberately keeps
// the field names `costTrend` and `purchaseFrequencyPerYear` (spread
// straight through from metrics/supplierMetrics.js, 12B) specifically so
// both frozen aggregators apply unmodified, the same "deep reuse via a
// shared field name" precedent metrics/salesMetrics.js (12C) established.

import { aggregatePurchaseTrendSummary } from './purchaseTrendSummaryAggregator.js';
import { aggregatePurchaseFrequencySummary } from './purchaseFrequencySummaryAggregator.js';

/**
 * @param {object[]} supplierPerformanceMetricsList from metrics/supplierPerformanceMetrics.js
 * @param {object} [opts] forwarded to aggregatePurchaseFrequencySummary (highFrequencyPurchasesPerYear, lowFrequencyPurchasesPerYear)
 * @returns {object} company-wide supplier performance totals
 */
export function aggregateSupplierPerformanceSummary (supplierPerformanceMetricsList, opts = {}) {
  const totalPurchaseValue = supplierPerformanceMetricsList.reduce((sum, s) => sum + s.purchaseValue, 0);
  const totalRevenueContribution = supplierPerformanceMetricsList.reduce((sum, s) => sum + s.revenueContribution, 0);
  const totalInventoryContribution = supplierPerformanceMetricsList.reduce((sum, s) => sum + s.inventoryContribution, 0);

  const withMargin = supplierPerformanceMetricsList.filter((s) => s.marginContributionPct !== null);
  const avgMarginContributionPct = withMargin.length
    ? withMargin.reduce((sum, s) => sum + s.marginContributionPct, 0) / withMargin.length
    : null;

  const trendSummary = aggregatePurchaseTrendSummary(supplierPerformanceMetricsList);
  const frequencySummary = aggregatePurchaseFrequencySummary(supplierPerformanceMetricsList, opts);

  const stablePriceCount = supplierPerformanceMetricsList.filter((s) => s.priceStability === 'stable').length;
  const volatilePriceCount = supplierPerformanceMetricsList.filter((s) => s.priceStability === 'volatile').length;

  return {
    supplierCount: supplierPerformanceMetricsList.length,
    totalPurchaseValue,
    totalRevenueContribution,
    totalInventoryContribution,
    avgMarginContributionPct,
    risingCostCount: trendSummary.risingCount,
    fallingCostCount: trendSummary.fallingCount,
    stableCostCount: trendSummary.stableCount,
    highFrequencySupplierCount: frequencySummary.highFrequencyCount,
    lowFrequencySupplierCount: frequencySummary.lowFrequencyCount,
    stablePriceCount,
    volatilePriceCount
  };
}
