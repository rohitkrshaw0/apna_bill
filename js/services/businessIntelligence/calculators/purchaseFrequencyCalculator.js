// calculators/purchaseFrequencyCalculator.js
// Pure calculation only (Milestone 12B). Purchase frequency reuses
// calculators/turnoverCalculator.js's calculateDailySalesVelocity() as-is
// (frozen, unmodified by this milestone) -- "purchases per day over a
// window" is exactly the same division `qty or count / lookbackDays`
// calculateDailySalesVelocity() already computes for sales; this is the
// milestone brief's own "generalize it, don't copy it" instruction applied
// literally: the existing function is called again with a purchase count
// instead of a sold quantity, rather than re-implementing the same
// division a second time under a new name.

import { calculateDailySalesVelocity } from './turnoverCalculator.js';
import { MS_PER_DAY, DAYS_PER_YEAR } from '../shared/config.js';

/**
 * @param {number} purchaseCount how many purchases (bills, or purchase_line
 *   rows, depending on the caller's own unit of counting) occurred within the window
 * @param {number} lookbackDays
 * @returns {number} average purchases per day over the window
 */
export function calculatePurchaseFrequency (purchaseCount, lookbackDays) {
  return calculateDailySalesVelocity(purchaseCount, lookbackDays);
}

/**
 * @param {number} purchasesPerDay from calculatePurchaseFrequency()
 * @returns {number} purchases per year, annualized -- the unit
 *   PURCHASE_DEFAULTS.highFrequencyPurchasesPerYear/lowFrequencyPurchasesPerYear
 *   (shared/config.js) are expressed in
 */
export function annualizePurchaseFrequency (purchasesPerDay) {
  return purchasesPerDay * DAYS_PER_YEAR;
}

/**
 * @param {string[]} datesAscending billDate strings (YYYY-MM-DD), already sorted ascending, one per purchase
 * @returns {number|null} average number of days between consecutive purchases, or null with fewer than 2 dates
 */
export function calculateAvgDaysBetweenPurchases (datesAscending) {
  if (datesAscending.length < 2) return null;
  let totalGapDays = 0;
  for (let i = 1; i < datesAscending.length; i++) {
    const gapMs = new Date(datesAscending[i]).getTime() - new Date(datesAscending[i - 1]).getTime();
    totalGapDays += gapMs / MS_PER_DAY;
  }
  return totalGapDays / (datesAscending.length - 1);
}
