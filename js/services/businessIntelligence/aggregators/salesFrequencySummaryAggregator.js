// aggregators/salesFrequencySummaryAggregator.js (Milestone 12C)
// Same generic shape as aggregators/purchaseFrequencySummaryAggregator.js
// (12B, frozen) -- generic over any metric list carrying a
// `salesFrequencyPerYear` field, works identically for item-level
// (metrics/salesMetrics.js) or customer-level (metrics/customerMetrics.js)
// metrics. A NEW file rather than a reuse of the frozen 12B aggregator,
// because that one hardcodes `.purchaseFrequencyPerYear` -- a field name
// that would be actively misleading on a public-facing Sales Intelligence
// row (unlike `costTrend`, a genuinely domain-neutral name this milestone
// *does* reuse verbatim, see metrics/salesMetrics.js's own header comment).
// This is the one deliberate exception to this milestone's otherwise
// reuse-heavy design, documented in the milestone's own Reuse Audit.

import { SALES_DEFAULTS } from '../shared/config.js';

/**
 * @param {object[]} metricsList item or customer metrics, each with `salesFrequencyPerYear`
 * @param {{highDemandSalesPerYear?: number, lowPerformingSalesPerYear?: number}} [opts]
 * @returns {{highDemand: object[], lowPerforming: object[], highDemandCount: number, lowPerformingCount: number}}
 */
export function aggregateSalesFrequencySummary (metricsList, opts = {}) {
  const highThreshold = opts.highDemandSalesPerYear ?? SALES_DEFAULTS.highDemandSalesPerYear;
  const lowThreshold = opts.lowPerformingSalesPerYear ?? SALES_DEFAULTS.lowPerformingSalesPerYear;

  const highDemand = metricsList.filter((m) => m.salesFrequencyPerYear >= highThreshold);
  const lowPerforming = metricsList.filter((m) => m.salesFrequencyPerYear <= lowThreshold);

  return {
    highDemand,
    lowPerforming,
    highDemandCount: highDemand.length,
    lowPerformingCount: lowPerforming.length
  };
}
