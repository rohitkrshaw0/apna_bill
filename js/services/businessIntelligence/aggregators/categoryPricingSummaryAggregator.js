// aggregators/categoryPricingSummaryAggregator.js (Milestone 12D)
// Same pattern as 12A's categorySummaryAggregator.js, 12B's
// categoryPurchaseSummaryAggregator.js, and 12C's
// categorySalesSummaryAggregator.js (all frozen) -- a new, small, sibling
// file rather than a modification of any of them, because each reduces
// over that domain's own field names, which the frozen files cannot be
// changed to accommodate. All four reuse
// calculators/categoryCalculator.js's groupMetricsByCategory() verbatim.

import { groupMetricsByCategory } from '../calculators/categoryCalculator.js';

/**
 * @param {object[]} pricingMetricsList from metrics/pricingMetrics.js
 * @returns {object[]} one row per category, highest average margin % first
 */
export function aggregateCategoryPricingSummary (pricingMetricsList) {
  const grouped = groupMetricsByCategory(pricingMetricsList);
  const rows = [];

  for (const [category, items] of grouped) {
    const withMargin = items.filter((m) => m.marginPct !== null);
    const withMarkup = items.filter((m) => m.markupPct !== null);
    const avgMarginPct = withMargin.length ? withMargin.reduce((sum, m) => sum + m.marginPct, 0) / withMargin.length : null;
    const avgMarkupPct = withMarkup.length ? withMarkup.reduce((sum, m) => sum + m.markupPct, 0) / withMarkup.length : null;

    rows.push({
      category,
      itemCount: items.length,
      avgMarginPct,
      avgMarkupPct
    });
  }

  return rows.sort((a, b) => (b.avgMarginPct || 0) - (a.avgMarginPct || 0));
}
