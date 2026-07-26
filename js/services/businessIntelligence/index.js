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

export { MS_PER_DAY, DAYS_PER_YEAR, DEFAULT_LOOKBACK_DAYS, DEFAULT_CACHE_TTL_MS } from './shared/config.js';
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
