// aggregators/priceTrendSummaryAggregator.js (Milestone 12D)
// A thin, single-line delegation to
// aggregators/purchaseTrendSummaryAggregator.js (12B, frozen) -- that
// function's own logic (bucket by a `costTrend` field) is already 100%
// generic; it just expects the field literally named `costTrend`, and
// metrics/pricingMetrics.js exposes the selling-side trend as
// `sellingPriceTrend` instead (to stay unambiguous alongside its sibling
// `purchasePriceTrend` on the same row). This wrapper remaps the one field
// name the frozen aggregator needs, with ZERO new bucketing logic -- the
// same "generalize by composition" pattern
// aggregators/customerRankingAggregator.js (12C) already established for
// aggregators/supplierRankingAggregator.js.

import { aggregatePurchaseTrendSummary } from './purchaseTrendSummaryAggregator.js';

/**
 * @param {object[]} pricingMetricsList from metrics/pricingMetrics.js
 * @returns {{rising: object[], falling: object[], stable: object[], insufficientData: object[], risingCount: number, fallingCount: number, stableCount: number, insufficientDataCount: number}}
 */
export function aggregatePriceTrendSummary (pricingMetricsList) {
  return aggregatePurchaseTrendSummary(pricingMetricsList.map((m) => ({ ...m, costTrend: m.sellingPriceTrend })));
}
