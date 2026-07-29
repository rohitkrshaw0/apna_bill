// models/pricingInsightModels.js (Milestone 12D)
// Structured, frozen response shape -- mirrors models/insightModels.js
// (12A), models/purchaseInsightModels.js (12B), and
// models/salesInsightModels.js (12C), all frozen: a new, sibling file in
// the same folder, not an edit to any of them. Does no calculation of its
// own -- only assembles already-computed pieces from aggregators/,
// metrics/, and recommendations/ into one deep-frozen object.

import { deepFreeze } from '../shared/freezeDeep.js';

/**
 * The company-wide Pricing Summary model.
 * @param {object} args
 * @param {string} args.companyId
 * @param {string} args.generatedAt
 * @param {number} args.lookbackDays
 * @param {object} args.summary aggregators/pricingSummaryAggregator.js output
 * @param {object[]} args.categoryPerformance aggregators/categoryPricingSummaryAggregator.js output
 * @param {object} args.trendSummary aggregators/priceTrendSummaryAggregator.js output
 * @param {object} args.discountSummary aggregators/discountSummaryAggregator.js output
 * @param {object[]} args.highestMarginItems aggregators/topPurchasedItemsAggregator.js output (reused verbatim)
 * @param {object[]} args.lowestMarginItems aggregators/worstSellingItemsAggregator.js output (reused verbatim)
 * @param {object[]} args.recommendations recommendations/pricingRecommendations.js output
 * @returns {object} the frozen PricingSummary model
 */
export function buildPricingSummaryModel ({
  companyId, generatedAt, lookbackDays,
  summary, categoryPerformance, trendSummary, discountSummary,
  highestMarginItems, lowestMarginItems, recommendations
}) {
  return deepFreeze({
    companyId,
    generatedAt,
    lookbackDays,
    summary,
    categoryPerformance,
    priceTrend: trendSummary,
    discountSummary,
    highestMarginItems,
    lowestMarginItems,
    recommendations
  });
}
