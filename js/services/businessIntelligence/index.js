// services/businessIntelligence/index.js
// Public barrel for the Inventory Intelligence Platform (Milestone 12A).
// Every consumer -- a future Dashboard, Report, or Extension -- imports
// from here, never from an individual subfolder, the same convention
// events/, diagnostics/, jobs/, audit/, and extensions/ all already
// follow.
//
// This platform is READ ONLY: it never modifies inventory, stock,
// purchases, sales, or manufacturing, and it depends on the existing
// Infrastructure Platform (events/, diagnostics/, jobs/, extensions/,
// audit -- indirectly, via a published Domain Event) without any of them
// depending back on this one. See docs/architecture/business-intelligence.md
// for the full architecture reference.

export { MS_PER_DAY, DAYS_PER_YEAR, DEFAULT_LOOKBACK_DAYS, DEFAULT_CACHE_TTL_MS, PURCHASE_DEFAULTS } from './shared/config.js';
export { inventoryIntelligence, createInventoryIntelligenceApi } from './api/inventoryIntelligenceApi.js';
export { loadInventorySnapshot } from './inventory/inventoryDataLoader.js';
export { computeItemMetrics } from './metrics/itemMetrics.js';

export { calculateBatchValue, calculateInventoryValueForItem, calculateTotalInventoryValue } from './calculators/inventoryValueCalculator.js';
export { calculateBatchAgeDays, calculateStockAgeForItem } from './calculators/stockAgeCalculator.js';
export {
  calculateQtySoldInWindow, calculateQtyPurchasedInWindow, calculateCogsInWindow,
  calculateDailySalesVelocity, calculateDaysOfCover, calculateTurnoverRatio
} from './calculators/turnoverCalculator.js';
export { isOutOfStock, isLowStock, isDeadStock, isSlowMoving, isFastMoving, isOverstock, MOVEMENT_DEFAULTS } from './calculators/movementCalculator.js';
export { resolveCategory, groupMetricsByCategory, UNCATEGORIZED } from './calculators/categoryCalculator.js';

export { aggregateLowStock } from './aggregators/lowStockAggregator.js';
export { aggregateOutOfStock } from './aggregators/outOfStockAggregator.js';
export { aggregateDeadStock } from './aggregators/deadStockAggregator.js';
export { aggregateSlowMoving } from './aggregators/slowMovingAggregator.js';
export { aggregateFastMoving } from './aggregators/fastMovingAggregator.js';
export { aggregateOverstock } from './aggregators/overstockAggregator.js';
export { aggregateInventorySummary } from './aggregators/inventorySummaryAggregator.js';
export { aggregateCategorySummary } from './aggregators/categorySummaryAggregator.js';
export { aggregateReorderSummary } from './aggregators/reorderSummaryAggregator.js';

export { buildReorderRecommendation, buildReorderRecommendations, REORDER_DEFAULTS } from './recommendations/reorderRecommendations.js';
export { buildInventoryValueModel, buildInventoryInsightModel } from './models/insightModels.js';

export { createBiDiagnostics, biDiagnostics } from './diagnostics/biDiagnostics.js';
export { createInsightCache, insightCache } from './cache/insightCache.js';
export { recordInventoryInsightGenerated } from './audit/biAuditReporter.js';
export { BI_CAPABILITIES, getInventoryInsightProviders, getInventoryMetricProviders, getDashboardCardProviders } from './extensions/capabilityNames.js';
export { createRefreshInventoryInsightsJob } from './jobs/refreshInventoryInsightsJob.js';

// ---------------------------------------------------------------------
// Milestone 12B -- Purchase Intelligence. Same barrel, new sibling files;
// nothing above this line was changed to add these.
// ---------------------------------------------------------------------
export { loadPurchaseSnapshot } from './purchase/purchaseDataLoader.js';
export { computePurchaseMetrics } from './metrics/purchaseMetrics.js';
export { computeSupplierMetrics } from './metrics/supplierMetrics.js';

export { calculateAvgPurchasePrice, calculateLastPurchasePrice, calculateHighestPurchasePrice, calculateLowestPurchasePrice } from './calculators/averagePriceCalculator.js';
export { calculateRollingPurchaseAverage, calculateCostTrend, COST_TREND } from './calculators/purchaseTrendCalculator.js';
export { calculatePurchaseFrequency, annualizePurchaseFrequency, calculateAvgDaysBetweenPurchases } from './calculators/purchaseFrequencyCalculator.js';
export { calculateSupplierSpend } from './calculators/supplierSpendCalculator.js';

export { aggregatePurchaseSummary } from './aggregators/purchaseSummaryAggregator.js';
export { aggregateSupplierComparison } from './aggregators/supplierComparisonAggregator.js';
export { aggregateSupplierRanking } from './aggregators/supplierRankingAggregator.js';
export { aggregateCostHistory } from './aggregators/costHistoryAggregator.js';
export { aggregatePurchaseTrendSummary } from './aggregators/purchaseTrendSummaryAggregator.js';
export { aggregatePurchaseFrequencySummary } from './aggregators/purchaseFrequencySummaryAggregator.js';
export { aggregatePreferredSupplier } from './aggregators/preferredSupplierAggregator.js';
export { aggregateCategoryPurchaseSummary } from './aggregators/categoryPurchaseSummaryAggregator.js';
export { aggregateTopPurchasedItems } from './aggregators/topPurchasedItemsAggregator.js';

export { buildPurchaseRecommendation, buildPurchaseRecommendations } from './recommendations/purchaseRecommendations.js';
export { buildPurchaseSummaryModel, buildItemPurchaseInsightModel } from './models/purchaseInsightModels.js';

export { recordPurchaseInsightGenerated } from './audit/purchaseAuditReporter.js';
export { purchaseIntelligence, createPurchaseIntelligenceApi } from './api/purchaseIntelligenceApi.js';
export { createRefreshPurchaseInsightsJob } from './jobs/refreshPurchaseInsightsJob.js';

// ---------------------------------------------------------------------
// Milestone 12C -- Sales Intelligence. Same barrel, new sibling files;
// nothing above this line was changed to add these.
// ---------------------------------------------------------------------
export { SALES_DEFAULTS } from './shared/config.js';
export { loadSalesSnapshot } from './sales/salesDataLoader.js';
export { computeSalesMetrics } from './metrics/salesMetrics.js';
export { computeCustomerMetrics } from './metrics/customerMetrics.js';

export { calculateGrossSales, calculateReturnsValue, calculateNetSales, calculateNetUnitsSold, calculateReturnRate } from './calculators/revenueCalculator.js';
export { calculateGrossMargin } from './calculators/marginCalculator.js';

export { aggregateSalesSummary } from './aggregators/salesSummaryAggregator.js';
export { aggregateCategorySalesSummary } from './aggregators/categorySalesSummaryAggregator.js';
export { aggregateWorstSellingItems } from './aggregators/worstSellingItemsAggregator.js';
export { aggregateSeasonalitySummary } from './aggregators/seasonalitySummaryAggregator.js';
export { aggregateCustomerRanking } from './aggregators/customerRankingAggregator.js';
export { aggregateRevenueRanking } from './aggregators/revenueRankingAggregator.js';
export { aggregateSalesFrequencySummary } from './aggregators/salesFrequencySummaryAggregator.js';

export { buildItemSalesRecommendation, buildItemSalesRecommendations, buildCustomerRecommendation, buildCustomerRecommendations } from './recommendations/salesRecommendations.js';
export { buildSalesSummaryModel } from './models/salesInsightModels.js';

export { recordSalesInsightGenerated } from './audit/salesAuditReporter.js';
export { salesIntelligence, createSalesIntelligenceApi } from './api/salesIntelligenceApi.js';
export { createRefreshSalesInsightsJob } from './jobs/refreshSalesInsightsJob.js';
