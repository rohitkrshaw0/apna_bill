// aggregators/fastMovingAggregator.js
import { isFastMoving } from '../calculators/movementCalculator.js';

/**
 * @param {object[]} itemMetricsList from metrics/itemMetrics.js
 * @param {{fastMovingMinTurnsPerYear?: number}} [opts]
 * @returns {object[]} highest-velocity items, highest turnover first
 */
export function aggregateFastMoving (itemMetricsList, opts = {}) {
  return itemMetricsList
    .filter((m) => isFastMoving(m, opts))
    .sort((a, b) => (b.turnoverRatio ?? 0) - (a.turnoverRatio ?? 0));
}
