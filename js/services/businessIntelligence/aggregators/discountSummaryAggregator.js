// aggregators/discountSummaryAggregator.js (Milestone 12D)
// Company-wide discount rollup -- averages metrics/pricingMetrics.js's own
// per-item discount fields (calculators/discountCalculator.js); never
// re-derives a discount % itself. "Most Discounted Items" is deliberately
// NOT built here -- it reuses aggregators/topPurchasedItemsAggregator.js
// (12B, frozen) verbatim, sorted by `avgDiscountPct`, the same "generic
// top-N by field" reuse aggregators/salesIntelligenceApi.js's own
// getTopSellingItems() already relies on.

/**
 * @param {object[]} pricingMetricsList from metrics/pricingMetrics.js
 * @returns {{avgDiscountPct: number|null, maxDiscountPct: number|null, avgDiscountFrequencyPct: number|null, itemsWithDiscountCount: number}}
 */
export function aggregateDiscountSummary (pricingMetricsList) {
  const withDiscountData = pricingMetricsList.filter((m) => m.avgDiscountPct !== null);
  const itemsWithDiscount = withDiscountData.filter((m) => m.avgDiscountPct > 0);

  const avgDiscountPct = withDiscountData.length
    ? withDiscountData.reduce((sum, m) => sum + m.avgDiscountPct, 0) / withDiscountData.length
    : null;
  const maxDiscountPct = withDiscountData.length
    ? withDiscountData.reduce((max, m) => Math.max(max, m.maxDiscountPct || 0), 0)
    : null;
  const avgDiscountFrequencyPct = withDiscountData.length
    ? withDiscountData.reduce((sum, m) => sum + (m.discountFrequencyPct || 0), 0) / withDiscountData.length
    : null;

  return {
    avgDiscountPct,
    maxDiscountPct,
    avgDiscountFrequencyPct,
    itemsWithDiscountCount: itemsWithDiscount.length
  };
}
