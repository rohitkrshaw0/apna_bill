// models/purchaseInsightModels.js (Milestone 12B)
// Structured, frozen response shapes -- mirrors models/insightModels.js's
// own role from 12A (frozen, unmodified by this milestone; this is a new,
// sibling file in the same folder, not an edit to that one). Does no
// calculation of its own -- only assembles already-computed pieces from
// aggregators/, calculators/ (via metrics), and recommendations/ into one
// deep-frozen object per public API call.

import { deepFreeze } from '../shared/freezeDeep.js';

/**
 * The company-wide Purchase Summary model.
 * @param {object} args
 * @param {string} args.companyId
 * @param {string} args.generatedAt
 * @param {number} args.lookbackDays
 * @param {object} args.summary aggregators/purchaseSummaryAggregator.js output
 * @param {object[]} args.categoryPerformance aggregators/categoryPurchaseSummaryAggregator.js output
 * @param {object} args.trendSummary aggregators/purchaseTrendSummaryAggregator.js output
 * @param {object} args.frequencySummary aggregators/purchaseFrequencySummaryAggregator.js output (item-level)
 * @param {object[]} args.supplierRanking aggregators/supplierRankingAggregator.js output
 * @param {object[]} args.topPurchasedItems aggregators/topPurchasedItemsAggregator.js output
 * @param {object[]} args.recommendations recommendations/purchaseRecommendations.js output
 * @returns {object} the frozen PurchaseSummary model
 */
export function buildPurchaseSummaryModel ({
  companyId, generatedAt, lookbackDays,
  summary, categoryPerformance, trendSummary, frequencySummary,
  supplierRanking, topPurchasedItems, recommendations
}) {
  return deepFreeze({
    companyId,
    generatedAt,
    lookbackDays,
    summary,
    categoryPerformance,
    purchaseTrend: trendSummary,
    purchaseFrequency: frequencySummary,
    supplierRanking,
    topPurchasedItems,
    recommendations
  });
}

/**
 * The per-item Purchase Insight model -- the shape the milestone brief's
 * own "Insight Models" section illustrates: { averagePurchasePrice,
 * priceHistory, supplierComparison, purchaseTrend, costTrend,
 * supplierRanking (company-wide, see buildPurchaseSummaryModel),
 * purchaseFrequency, preferredSupplier, recommendations }.
 *
 * `purchaseTrend` and `costTrend` currently carry the same
 * calculators/purchaseTrendCalculator.js classification -- this milestone
 * only computes a PRICE trend; a future milestone could add an independent
 * quantity-trend calculation under the same `purchaseTrend` field without
 * changing this model's shape.
 *
 * @param {object} args
 * @param {string} args.companyId
 * @param {string} args.generatedAt
 * @param {number} args.lookbackDays
 * @param {string} args.itemId
 * @param {object|null} args.itemMetric one row from metrics/purchaseMetrics.js, or null if this item was never purchased in the window
 * @param {object[]} args.priceHistory aggregators/costHistoryAggregator.js output
 * @param {object[]} args.supplierComparison aggregators/supplierComparisonAggregator.js output
 * @param {object|null} args.preferredSupplier aggregators/preferredSupplierAggregator.js output
 * @param {object|null} args.recommendation recommendations/purchaseRecommendations.js output for this one item
 * @returns {object} the frozen per-item PurchaseInsight model
 */
export function buildItemPurchaseInsightModel ({
  companyId, generatedAt, lookbackDays, itemId,
  itemMetric, priceHistory, supplierComparison, preferredSupplier, recommendation
}) {
  return deepFreeze({
    companyId,
    generatedAt,
    lookbackDays,
    itemId,
    averagePurchasePrice: itemMetric?.avgPurchasePrice ?? null,
    lastPurchasePrice: itemMetric?.lastPurchasePrice ?? null,
    highestPurchasePrice: itemMetric?.highestPurchasePrice ?? null,
    lowestPurchasePrice: itemMetric?.lowestPurchasePrice ?? null,
    rollingPurchaseAverage: itemMetric?.rollingPurchaseAverage ?? null,
    priceHistory,
    supplierComparison,
    purchaseTrend: itemMetric?.costTrend ?? null,
    costTrend: itemMetric?.costTrend ?? null,
    costTrendChangePct: itemMetric?.costTrendChangePct ?? null,
    purchaseFrequency: itemMetric?.purchaseFrequencyPerYear ?? null,
    preferredSupplier,
    recommendations: recommendation
  });
}
