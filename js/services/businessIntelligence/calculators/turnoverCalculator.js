// calculators/turnoverCalculator.js
// Pure calculation only. Sales velocity, cost of goods sold, days-of-cover,
// and an annualized inventory turnover ratio -- all derived from the
// stock_ledger rows inventory/inventoryDataLoader.js already loaded for one
// item (never re-queried per calculation).
//
// Known, disclosed limitation (see docs/architecture/business-intelligence.md):
// a stock_ledger 'sale' row's unit_cost is the batch's cost basis (COGS)
// for batch-tracked items only -- sale_rpc.sql's own non-batch-tracked
// branch inserts a 'sale' row with no unit_cost at all (see
// inventory/inventoryDataLoader.js's header comment). A null unit_cost
// contributes 0 to COGS here rather than being estimated, which
// understates turnover for non-batch-tracked items specifically -- a real,
// disclosed limitation of the source data, not a calculation bug.

import { DAYS_PER_YEAR } from '../shared/config.js';

/**
 * @param {object[]} ledgerRows this item's stock_ledger rows within the lookback window
 * @returns {number} total qty_out across every 'sale' row
 */
export function calculateQtySoldInWindow (ledgerRows) {
  return ledgerRows
    .filter((r) => r.txnType === 'sale')
    .reduce((sum, r) => sum + (r.qtyOut || 0), 0);
}

/**
 * @param {object[]} ledgerRows
 * @returns {number} total qty_in across every 'purchase' row
 */
export function calculateQtyPurchasedInWindow (ledgerRows) {
  return ledgerRows
    .filter((r) => r.txnType === 'purchase')
    .reduce((sum, r) => sum + (r.qtyIn || 0), 0);
}

/**
 * @param {object[]} ledgerRows
 * @returns {number} sum(qty_out * unit_cost) across every 'sale' row (COGS proxy)
 */
export function calculateCogsInWindow (ledgerRows) {
  return ledgerRows
    .filter((r) => r.txnType === 'sale' && r.unitCost !== null)
    .reduce((sum, r) => sum + (r.qtyOut || 0) * r.unitCost, 0);
}

/**
 * @param {number} qtySoldInWindow
 * @param {number} lookbackDays
 * @returns {number} average units sold per day over the window
 */
export function calculateDailySalesVelocity (qtySoldInWindow, lookbackDays) {
  return lookbackDays > 0 ? qtySoldInWindow / lookbackDays : 0;
}

/**
 * @param {number} currentStock
 * @param {number} dailySalesVelocity
 * @returns {number|null} how many days the current stock would last at the
 *   observed sales pace, or null when velocity is 0 (cannot divide by zero
 *   -- a zero-velocity item is a dead/slow-stock signal, not "infinite cover")
 */
export function calculateDaysOfCover (currentStock, dailySalesVelocity) {
  if (!(dailySalesVelocity > 0)) return null;
  return currentStock / dailySalesVelocity;
}

/**
 * Annualized inventory turnover ratio: how many times the current
 * inventory value would be sold through in a year, at the observed COGS
 * rate over the lookback window.
 * @param {object} args
 * @param {number} args.cogsInWindow
 * @param {number} args.inventoryValue current inventory value for this item (or a category/company total)
 * @param {number} args.lookbackDays
 * @returns {number|null} null when inventoryValue is 0 (nothing on hand to compare against)
 */
export function calculateTurnoverRatio ({ cogsInWindow, inventoryValue, lookbackDays }) {
  if (!(inventoryValue > 0) || !(lookbackDays > 0)) return null;
  return (cogsInWindow / inventoryValue) * (DAYS_PER_YEAR / lookbackDays);
}
