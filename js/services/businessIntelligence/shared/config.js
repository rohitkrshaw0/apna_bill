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
