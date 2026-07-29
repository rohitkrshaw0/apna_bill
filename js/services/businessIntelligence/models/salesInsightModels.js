// models/salesInsightModels.js (Milestone 12C)
// Structured, frozen response shape -- mirrors models/insightModels.js (12A)
// and models/purchaseInsightModels.js (12B), both frozen: a new, sibling
// file in the same folder, not an edit to either. Does no calculation of
// its own -- only assembles already-computed pieces from aggregators/,
// metrics/, and recommendations/ into one deep-frozen object.

import { deepFreeze } from '../shared/freezeDeep.js';

/**
 * The company-wide Sales Summary model.
 * @param {object} args
 * @param {string} args.companyId
 * @param {string} args.generatedAt
 * @param {number} args.lookbackDays
 * @param {object} args.summary aggregators/salesSummaryAggregator.js output
 * @param {object[]} args.categoryPerformance aggregators/categorySalesSummaryAggregator.js output
 * @param {object} args.trendSummary aggregators/purchaseTrendSummaryAggregator.js output (reused verbatim)
 * @param {object} args.frequencySummary aggregators/salesFrequencySummaryAggregator.js output (item-level)
 * @param {object[]} args.revenueRanking aggregators/revenueRankingAggregator.js output
 * @param {object[]} args.customerRanking aggregators/customerRankingAggregator.js output
 * @param {object[]} args.topSellingItems aggregators/topPurchasedItemsAggregator.js output (reused verbatim)
 * @param {object[]} args.worstSellingItems aggregators/worstSellingItemsAggregator.js output
 * @param {object[]} args.topCustomers aggregators/topPurchasedItemsAggregator.js output (reused verbatim, over customer metrics)
 * @param {object[]} args.seasonality aggregators/seasonalitySummaryAggregator.js output
 * @param {object[]} args.itemRecommendations recommendations/salesRecommendations.js output (item-level)
 * @param {object[]} args.customerRecommendations recommendations/salesRecommendations.js output (customer-level)
 * @returns {object} the frozen SalesSummary model
 */
export function buildSalesSummaryModel ({
  companyId, generatedAt, lookbackDays,
  summary, categoryPerformance, trendSummary, frequencySummary,
  revenueRanking, customerRanking, topSellingItems, worstSellingItems,
  topCustomers, seasonality, itemRecommendations, customerRecommendations
}) {
  return deepFreeze({
    companyId,
    generatedAt,
    lookbackDays,
    summary,
    categoryPerformance,
    salesTrend: trendSummary,
    salesFrequency: frequencySummary,
    revenueRanking,
    customerRanking,
    topSellingItems,
    worstSellingItems,
    topCustomers,
    seasonality,
    recommendations: {
      items: itemRecommendations,
      customers: customerRecommendations
    }
  });
}
