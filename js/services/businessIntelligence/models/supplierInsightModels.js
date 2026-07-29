// models/supplierInsightModels.js (Milestone 12E)
// Structured, frozen response shape -- mirrors models/insightModels.js
// (12A), models/purchaseInsightModels.js (12B), models/salesInsightModels.js
// (12C), and models/pricingInsightModels.js (12D), all frozen: a new,
// sibling file in the same folder, not an edit to any of them. Does no
// calculation of its own -- only assembles already-computed pieces from
// aggregators/, metrics/, and recommendations/ into one deep-frozen object.

import { deepFreeze } from '../shared/freezeDeep.js';

/**
 * The company-wide Supplier Summary model.
 * @param {object} args
 * @param {string} args.companyId
 * @param {string} args.generatedAt
 * @param {number} args.lookbackDays
 * @param {object} args.summary aggregators/supplierPerformanceSummaryAggregator.js output
 * @param {object[]} args.categoryPerformance aggregators/supplierCategorySummaryAggregator.js output
 * @param {object} args.trendSummary aggregators/purchaseTrendSummaryAggregator.js output (reused verbatim)
 * @param {object} args.frequencySummary aggregators/purchaseFrequencySummaryAggregator.js output (reused verbatim)
 * @param {object[]} args.supplierRanking aggregators/supplierRankingAggregator.js output (reused verbatim)
 * @param {object[]} args.topSuppliers aggregators/topPurchasedItemsAggregator.js output (reused verbatim)
 * @param {object[]} args.weakSuppliers aggregators/worstSellingItemsAggregator.js output (reused verbatim)
 * @param {object[]} args.recommendations recommendations/supplierRecommendations.js output
 * @returns {object} the frozen SupplierSummary model
 */
export function buildSupplierSummaryModel ({
  companyId, generatedAt, lookbackDays,
  summary, categoryPerformance, trendSummary, frequencySummary,
  supplierRanking, topSuppliers, weakSuppliers, recommendations
}) {
  return deepFreeze({
    companyId,
    generatedAt,
    lookbackDays,
    summary,
    categoryPerformance,
    costTrend: trendSummary,
    purchaseFrequency: frequencySummary,
    supplierRanking,
    topSuppliers,
    weakSuppliers,
    recommendations
  });
}
