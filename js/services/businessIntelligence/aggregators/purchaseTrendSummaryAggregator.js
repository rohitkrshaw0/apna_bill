// aggregators/purchaseTrendSummaryAggregator.js (Milestone 12B)
// Buckets already-classified metric objects by their own `costTrend` field
// (calculators/purchaseTrendCalculator.js's COST_TREND) -- never
// re-classifies anything itself.

import { COST_TREND } from '../calculators/purchaseTrendCalculator.js';

/**
 * @param {object[]} purchaseMetricsList from metrics/purchaseMetrics.js (each with a `costTrend` field)
 * @returns {{rising: object[], falling: object[], stable: object[], insufficientData: object[], risingCount: number, fallingCount: number, stableCount: number, insufficientDataCount: number}}
 */
export function aggregatePurchaseTrendSummary (purchaseMetricsList) {
  const rising = purchaseMetricsList.filter((m) => m.costTrend === COST_TREND.RISING);
  const falling = purchaseMetricsList.filter((m) => m.costTrend === COST_TREND.FALLING);
  const stable = purchaseMetricsList.filter((m) => m.costTrend === COST_TREND.STABLE);
  const insufficientData = purchaseMetricsList.filter((m) => m.costTrend === COST_TREND.INSUFFICIENT_DATA);

  return {
    rising, falling, stable, insufficientData,
    risingCount: rising.length,
    fallingCount: falling.length,
    stableCount: stable.length,
    insufficientDataCount: insufficientData.length
  };
}
