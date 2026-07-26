// aggregators/slowMovingAggregator.js
import { isSlowMoving } from '../calculators/movementCalculator.js';

/**
 * @param {object[]} itemMetricsList from metrics/itemMetrics.js
 * @param {{slowMovingMaxTurnsPerYear?: number, deadStockDays?: number}} [opts]
 * @returns {object[]} items selling, but slowly, lowest turnover first
 */
export function aggregateSlowMoving (itemMetricsList, opts = {}) {
  return itemMetricsList
    .filter((m) => isSlowMoving(m, opts))
    .sort((a, b) => (a.turnoverRatio ?? 0) - (b.turnoverRatio ?? 0));
}
