// calculators/stockAgeCalculator.js
// Pure calculation only. "Stock Age" = how long the stock currently on
// hand has been sitting, since the batch it lives in was created --
// weighted by quantity so a big old batch counts for more than a small one.

import { MS_PER_DAY } from '../shared/config.js';

/**
 * @param {{createdAt: string}} batch
 * @param {Date} asOfDate
 * @returns {number} age in whole days, never negative
 */
export function calculateBatchAgeDays (batch, asOfDate) {
  const created = new Date(batch.createdAt).getTime();
  const diff = asOfDate.getTime() - created;
  return diff > 0 ? Math.floor(diff / MS_PER_DAY) : 0;
}

/**
 * @param {object[]} batches every batch row for one item (only ones with
 *   qtyOnHand > 0 are considered "stock currently on hand")
 * @param {Date} [asOfDate]
 * @returns {number|null} qty-weighted average age in days, or null if no stock on hand
 */
export function calculateStockAgeForItem (batches, asOfDate = new Date()) {
  const withStock = batches.filter((b) => (b.qtyOnHand || 0) > 0);
  const totalQty = withStock.reduce((sum, b) => sum + b.qtyOnHand, 0);
  if (totalQty <= 0) return null;
  const weightedDays = withStock.reduce((sum, b) => sum + calculateBatchAgeDays(b, asOfDate) * b.qtyOnHand, 0);
  return weightedDays / totalQty;
}
