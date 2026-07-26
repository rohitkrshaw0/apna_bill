// aggregators/purchaseFrequencySummaryAggregator.js (Milestone 12B)
// Generic over any metric list carrying a `purchaseFrequencyPerYear` field
// -- works identically for item-level metrics (metrics/purchaseMetrics.js)
// or supplier-level metrics (metrics/supplierMetrics.js), since both
// expose that same field name. Never re-derives the frequency itself.

import { PURCHASE_DEFAULTS } from '../shared/config.js';

/**
 * @param {object[]} metricsList item or supplier metrics, each with `purchaseFrequencyPerYear`
 * @param {{highFrequencyPurchasesPerYear?: number, lowFrequencyPurchasesPerYear?: number}} [opts]
 * @returns {{highFrequency: object[], lowFrequency: object[], highFrequencyCount: number, lowFrequencyCount: number}}
 */
export function aggregatePurchaseFrequencySummary (metricsList, opts = {}) {
  const highThreshold = opts.highFrequencyPurchasesPerYear ?? PURCHASE_DEFAULTS.highFrequencyPurchasesPerYear;
  const lowThreshold = opts.lowFrequencyPurchasesPerYear ?? PURCHASE_DEFAULTS.lowFrequencyPurchasesPerYear;

  const highFrequency = metricsList.filter((m) => m.purchaseFrequencyPerYear >= highThreshold);
  const lowFrequency = metricsList.filter((m) => m.purchaseFrequencyPerYear <= lowThreshold);

  return {
    highFrequency,
    lowFrequency,
    highFrequencyCount: highFrequency.length,
    lowFrequencyCount: lowFrequency.length
  };
}
