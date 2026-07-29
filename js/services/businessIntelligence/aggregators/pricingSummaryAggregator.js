// aggregators/pricingSummaryAggregator.js (Milestone 12D)
// Combines every other pricing aggregator's output into one company-wide
// totals object -- never re-derives a predicate itself, the same
// composition rule aggregators/inventorySummaryAggregator.js (12A),
// aggregators/purchaseSummaryAggregator.js (12B), and
// aggregators/salesSummaryAggregator.js (12C), all frozen, already
// established.

import { aggregatePriceTrendSummary } from './priceTrendSummaryAggregator.js';
import { aggregateMarginThreshold } from './marginThresholdAggregator.js';
import { aggregateDiscountSummary } from './discountSummaryAggregator.js';

/**
 * @param {object[]} pricingMetricsList from metrics/pricingMetrics.js
 * @param {object} [opts] forwarded to aggregateMarginThreshold (targetMarginPct)
 * @returns {object} company-wide pricing totals
 */
export function aggregatePricingSummary (pricingMetricsList, opts = {}) {
  const withMargin = pricingMetricsList.filter((m) => m.marginPct !== null);
  const withMarkup = pricingMetricsList.filter((m) => m.markupPct !== null);

  const avgMarginPct = withMargin.length ? withMargin.reduce((sum, m) => sum + m.marginPct, 0) / withMargin.length : null;
  const avgMarkupPct = withMarkup.length ? withMarkup.reduce((sum, m) => sum + m.markupPct, 0) / withMarkup.length : null;

  const trendSummary = aggregatePriceTrendSummary(pricingMetricsList);
  const marginThreshold = aggregateMarginThreshold(pricingMetricsList, opts);
  const discountSummary = aggregateDiscountSummary(pricingMetricsList);

  const stableCount = pricingMetricsList.filter((m) => m.priceStability === 'stable').length;
  const volatileCount = pricingMetricsList.filter((m) => m.priceStability === 'volatile').length;

  return {
    itemCount: pricingMetricsList.length,
    avgMarginPct,
    avgMarkupPct,
    avgDiscountPct: discountSummary.avgDiscountPct,
    aboveTargetMarginCount: marginThreshold.aboveTargetCount,
    belowTargetMarginCount: marginThreshold.belowTargetCount,
    risingCount: trendSummary.risingCount,
    fallingCount: trendSummary.fallingCount,
    stablePriceTrendCount: trendSummary.stableCount,
    stablePriceStabilityCount: stableCount,
    volatilePriceStabilityCount: volatileCount
  };
}
