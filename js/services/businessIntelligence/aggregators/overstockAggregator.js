// aggregators/overstockAggregator.js
import { isOverstock } from '../calculators/movementCalculator.js';

/**
 * @param {object[]} itemMetricsList from metrics/itemMetrics.js
 * @param {{overstockDaysOfCover?: number, deadStockDays?: number}} [opts]
 * @returns {object[]} items selling, but with far more days-of-cover on hand than needed, worst first
 */
export function aggregateOverstock (itemMetricsList, opts = {}) {
  return itemMetricsList
    .filter((m) => isOverstock(m, opts))
    .sort((a, b) => (b.daysOfCover ?? 0) - (a.daysOfCover ?? 0));
}
