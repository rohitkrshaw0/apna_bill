// aggregators/deadStockAggregator.js
import { isDeadStock, MOVEMENT_DEFAULTS } from '../calculators/movementCalculator.js';

/**
 * @param {object[]} itemMetricsList from metrics/itemMetrics.js
 * @param {{deadStockDays?: number}} [opts]
 * @returns {object[]} stock on hand with no recent sale, oldest/most-stale first
 */
export function aggregateDeadStock (itemMetricsList, opts = {}) {
  return itemMetricsList
    .filter((m) => isDeadStock(m, opts))
    .sort((a, b) => (b.daysSinceLastSale ?? Infinity) - (a.daysSinceLastSale ?? Infinity));
}

export { MOVEMENT_DEFAULTS };
