// shared/config.js
// The single source of truth for every tunable numeric constant this
// platform uses -- calendar constants (MS_PER_DAY, DAYS_PER_YEAR), the
// default lookback window, the default cache TTL, and every movement/
// reorder business threshold. No calculator, aggregator, loader, or cache
// file defines its own copy of any of these -- each imports from here.
// This is what "no hard-coded thresholds or magic numbers" means in
// practice: one file to read to know every knob this platform has, and one
// file to change to retune all of them at once.
//
// MOVEMENT_DEFAULTS and REORDER_DEFAULTS are still re-exported from
// calculators/movementCalculator.js and recommendations/reorderRecommendations.js
// respectively (their existing, documented public names) so no consumer's
// import path changes -- only where the VALUES themselves live changed.

/** Milliseconds in a day -- used for every age/days-since calculation (batch age, days since last sale/purchase). */
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Calendar days in a year -- used only to annualize a turnover ratio computed over an arbitrary lookbackDays window. */
export const DAYS_PER_YEAR = 365;

/** How many days of stock_ledger history inventory/inventoryDataLoader.js scans by default. */
export const DEFAULT_LOOKBACK_DAYS = 365;

/** How long cache/insightCache.js keeps a computed item-metrics snapshot before it's considered stale. */
export const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Movement classification thresholds (calculators/movementCalculator.js).
 * All overridable per call -- a future Dashboard/Report can tune
 * sensitivity without touching this file or movementCalculator.js.
 */
export const MOVEMENT_DEFAULTS = Object.freeze({
  deadStockDays: 180,        // no sale observed in the ledger window for at least this many days
  slowMovingMaxTurnsPerYear: 2,
  fastMovingMinTurnsPerYear: 12,
  overstockDaysOfCover: 90
});

/**
 * Reorder recommendation thresholds (recommendations/reorderRecommendations.js).
 */
export const REORDER_DEFAULTS = Object.freeze({
  leadTimeDays: 7,              // assumed days between placing a purchase order and receiving stock
  safetyStockDays: 7,           // extra buffer beyond lead time
  noVelocityRestockMultiplier: 2 // fallback target-stock heuristic (threshold x this) when an item has zero observed sales velocity
});

/**
 * Purchase Intelligence thresholds (Milestone 12B) -- calculators/purchaseTrendCalculator.js,
 * recommendations/purchaseRecommendations.js. All overridable per call, the
 * same as MOVEMENT_DEFAULTS/REORDER_DEFAULTS above.
 */
export const PURCHASE_DEFAULTS = Object.freeze({
  rollingAverageWindow: 5,           // how many of an item's most recent purchases calculateRollingPurchaseAverage() averages
  trendThresholdPct: 5,              // % change between recent-half vs older-half avg price before calling it "rising"/"falling" rather than "stable"
  minSuppliersForConsolidation: 3,   // an item bought from at least this many distinct suppliers is a consolidation candidate
  betterCostThresholdPct: 5,         // cheapest supplier's avg price must be at least this % below the preferred supplier's to flag a cost opportunity
  highFrequencyPurchasesPerYear: 24, // >= this many purchases/year for an item or supplier is "high frequency" (also implies a bulk-purchase opportunity)
  lowFrequencyPurchasesPerYear: 2    // <= this many purchases/year is "low frequency"
});

/**
 * Sales Intelligence thresholds (Milestone 12C) -- metrics/salesMetrics.js,
 * recommendations/salesRecommendations.js. All overridable per call, the
 * same as MOVEMENT_DEFAULTS/REORDER_DEFAULTS/PURCHASE_DEFAULTS above.
 * `rollingAverageWindow` and `trendThresholdPct` are deliberately NOT
 * duplicated here -- Sales Intelligence reuses PURCHASE_DEFAULTS' own
 * values for those two (see calculators/purchaseTrendCalculator.js reuse,
 * documented in metrics/salesMetrics.js), overridable via the same opts keys.
 */
export const SALES_DEFAULTS = Object.freeze({
  highDemandSalesPerYear: 24,   // >= this many sale transactions/year for an item is "high demand" / "fast selling"
  lowPerformingSalesPerYear: 2, // <= this many sale transactions/year is "low performing" (a worst-selling candidate)
  retentionGapMultiplier: 2,    // a customer overdue by more than this multiple of their own avgDaysBetweenPurchases is a retention opportunity
  upsellBelowCompanyAvgPct: 80  // a customer's avgOrderValue below this % of the company-wide average order value is an upsell opportunity
});

/**
 * Pricing Intelligence thresholds (Milestone 12D) --
 * calculators/priceVolatilityCalculator.js, recommendations/pricingRecommendations.js.
 * All overridable per call, the same as every other *_DEFAULTS block above.
 */
export const PRICING_DEFAULTS = Object.freeze({
  targetMarginPct: 20,          // margin % at/above this is considered a healthy target margin
  lowMarginThresholdPct: 10,    // margin % at/below this triggers a low-margin warning
  highDiscountThresholdPct: 15, // average discount % at/above this triggers a high-discount warning
  stableMaxVolatilityPct: 5,    // price coefficient-of-variation at/below this is classified "stable"
  volatileMinVolatilityPct: 15  // price coefficient-of-variation at/above this is classified "volatile" (between the two = "moderate")
});
