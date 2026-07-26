// aggregators/lowStockAggregator.js
// Combines calculator output (movementCalculator's isLowStock predicate)
// into one reusable list. Never re-derives the predicate itself.

import { isLowStock } from '../calculators/movementCalculator.js';

/**
 * @param {object[]} itemMetricsList from metrics/itemMetrics.js
 * @returns {object[]} items at or below their own low_stock_threshold, most urgent (lowest stock) first
 */
export function aggregateLowStock (itemMetricsList) {
  return itemMetricsList
    .filter((m) => isLowStock(m))
    .sort((a, b) => a.currentStock - b.currentStock);
}
