// aggregators/marginThresholdAggregator.js (Milestone 12D)
// Items Below/Above Target Margin -- a predicate classification, not a
// sort/rank (see aggregators/topPurchasedItemsAggregator.js /
// aggregators/worstSellingItemsAggregator.js, both reused verbatim
// elsewhere in this domain for ranking). Genuinely new: no existing
// aggregator classifies items against a configurable margin target.

import { PRICING_DEFAULTS } from '../shared/config.js';

/**
 * @param {object[]} pricingMetricsList from metrics/pricingMetrics.js
 * @param {{targetMarginPct?: number}} [opts]
 * @returns {{aboveTarget: object[], belowTarget: object[], aboveTargetCount: number, belowTargetCount: number}}
 *   Items with a null marginPct (never sold, or never purchased -- no
 *   price-point to compare) are excluded from both buckets, not silently
 *   counted as below target.
 */
export function aggregateMarginThreshold (pricingMetricsList, { targetMarginPct = PRICING_DEFAULTS.targetMarginPct } = {}) {
  const withMargin = pricingMetricsList.filter((m) => m.marginPct !== null);
  const aboveTarget = withMargin.filter((m) => m.marginPct >= targetMarginPct);
  const belowTarget = withMargin.filter((m) => m.marginPct < targetMarginPct);

  return {
    aboveTarget,
    belowTarget,
    aboveTargetCount: aboveTarget.length,
    belowTargetCount: belowTarget.length
  };
}
