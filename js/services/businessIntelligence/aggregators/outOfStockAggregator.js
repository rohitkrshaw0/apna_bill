// aggregators/outOfStockAggregator.js
import { isOutOfStock } from '../calculators/movementCalculator.js';

/**
 * @param {object[]} itemMetricsList from metrics/itemMetrics.js
 * @returns {object[]} stock-tracked items with zero (or negative) current stock, by name
 */
export function aggregateOutOfStock (itemMetricsList) {
  return itemMetricsList
    .filter((m) => isOutOfStock(m))
    .sort((a, b) => a.name.localeCompare(b.name));
}
