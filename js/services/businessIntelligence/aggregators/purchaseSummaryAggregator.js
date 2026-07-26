// aggregators/purchaseSummaryAggregator.js (Milestone 12B)
// Combines every other purchase aggregator's output into one company-wide
// totals object -- never re-derives a predicate itself, the same
// composition rule aggregators/inventorySummaryAggregator.js (12A, frozen)
// established for the Inventory Intelligence side of this platform.

import { aggregatePurchaseTrendSummary } from './purchaseTrendSummaryAggregator.js';
import { aggregatePurchaseFrequencySummary } from './purchaseFrequencySummaryAggregator.js';

/**
 * @param {object[]} purchaseMetricsList from metrics/purchaseMetrics.js
 * @param {object[]} supplierMetricsList from metrics/supplierMetrics.js
 * @param {object} [opts] forwarded to aggregatePurchaseFrequencySummary
 */
export function aggregatePurchaseSummary (purchaseMetricsList, supplierMetricsList, opts = {}) {
  const totalPurchaseQty = purchaseMetricsList.reduce((sum, m) => sum + m.purchaseQty, 0);
  const totalPurchaseValue = purchaseMetricsList.reduce((sum, m) => sum + m.purchaseValue, 0);
  const totalPurchaseCount = purchaseMetricsList.reduce((sum, m) => sum + m.purchaseCount, 0);

  const trendSummary = aggregatePurchaseTrendSummary(purchaseMetricsList);
  const itemFrequencySummary = aggregatePurchaseFrequencySummary(purchaseMetricsList, opts);
  const supplierFrequencySummary = aggregatePurchaseFrequencySummary(supplierMetricsList, opts);

  return {
    itemCount: purchaseMetricsList.length,
    supplierCount: supplierMetricsList.length,
    totalPurchaseQty,
    totalPurchaseValue,
    totalPurchaseCount,
    avgPurchasePrice: totalPurchaseQty > 0 ? totalPurchaseValue / totalPurchaseQty : null,
    risingCostCount: trendSummary.risingCount,
    fallingCostCount: trendSummary.fallingCount,
    stableCostCount: trendSummary.stableCount,
    highFrequencyItemCount: itemFrequencySummary.highFrequencyCount,
    lowFrequencyItemCount: itemFrequencySummary.lowFrequencyCount,
    highFrequencySupplierCount: supplierFrequencySummary.highFrequencyCount,
    lowFrequencySupplierCount: supplierFrequencySummary.lowFrequencyCount
  };
}
