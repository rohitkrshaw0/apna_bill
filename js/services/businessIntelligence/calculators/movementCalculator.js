// calculators/movementCalculator.js
// Pure calculation only. Centralizes the Low/Out-of-Stock/Dead/Slow/Fast/
// Overstock decision predicates in exactly one place so aggregators never
// duplicate this logic (per the milestone brief: "Aggregators must NEVER
// duplicate calculator logic"). Every function here is a pure predicate
// over one item's already-computed metric object -- see metrics/itemMetrics.js
// for how {currentStock, turnoverRatio, daysSinceLastSale, daysOfCover, ...}
// are produced.
//
// Defaults are deliberately named constants, not magic numbers, and are
// all overridable per call -- a future Dashboard/Report can tune
// sensitivity without touching this file. The values themselves live in
// shared/config.js (the single source of truth for every tunable constant
// this platform has) -- re-exported here under this file's own,
// already-documented public name so no existing import path changes.

import { MOVEMENT_DEFAULTS } from '../shared/config.js';
export { MOVEMENT_DEFAULTS };

/** @param {{trackStock: boolean, currentStock: number}} m */
export function isOutOfStock (m) {
  return !!m.trackStock && m.currentStock <= 0;
}

/** @param {{trackStock: boolean, currentStock: number, lowStockThreshold: number}} m */
export function isLowStock (m) {
  return !!m.trackStock && m.currentStock > 0 && m.lowStockThreshold > 0 && m.currentStock <= m.lowStockThreshold;
}

/**
 * @param {{trackStock: boolean, currentStock: number, daysSinceLastSale: number|null}} m
 * @param {{deadStockDays?: number}} [opts]
 */
export function isDeadStock (m, { deadStockDays = MOVEMENT_DEFAULTS.deadStockDays } = {}) {
  if (!m.trackStock || m.currentStock <= 0) return false;
  return m.daysSinceLastSale === null || m.daysSinceLastSale >= deadStockDays;
}

/**
 * @param {{trackStock: boolean, currentStock: number, turnoverRatio: number|null}} m
 * @param {{slowMovingMaxTurnsPerYear?: number, deadStockDays?: number}} [opts]
 */
export function isSlowMoving (m, opts = {}) {
  const { slowMovingMaxTurnsPerYear = MOVEMENT_DEFAULTS.slowMovingMaxTurnsPerYear } = opts;
  if (!m.trackStock || m.currentStock <= 0) return false;
  if (isDeadStock(m, opts)) return false;
  return m.turnoverRatio !== null && m.turnoverRatio < slowMovingMaxTurnsPerYear;
}

/**
 * @param {{trackStock: boolean, turnoverRatio: number|null}} m
 * @param {{fastMovingMinTurnsPerYear?: number}} [opts]
 */
export function isFastMoving (m, { fastMovingMinTurnsPerYear = MOVEMENT_DEFAULTS.fastMovingMinTurnsPerYear } = {}) {
  return !!m.trackStock && m.turnoverRatio !== null && m.turnoverRatio >= fastMovingMinTurnsPerYear;
}

/**
 * "Potential excess inventory" -- stock that DOES sell, just far more of it
 * is on hand than the observed sales pace justifies. Deliberately excludes
 * dead stock (that's a different, more severe signal).
 * @param {{trackStock: boolean, currentStock: number, daysOfCover: number|null}} m
 * @param {{overstockDaysOfCover?: number, deadStockDays?: number}} [opts]
 */
export function isOverstock (m, opts = {}) {
  const { overstockDaysOfCover = MOVEMENT_DEFAULTS.overstockDaysOfCover } = opts;
  if (!m.trackStock || m.currentStock <= 0) return false;
  if (isDeadStock(m, opts)) return false;
  return m.daysOfCover !== null && m.daysOfCover > overstockDaysOfCover;
}
