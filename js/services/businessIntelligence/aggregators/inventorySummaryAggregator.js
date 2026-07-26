// aggregators/inventorySummaryAggregator.js
// Combines every other aggregator's output into one company-wide totals
// object -- never re-derives any predicate itself (per the brief:
// "Aggregators must NEVER duplicate calculator logic").

import { calculateTotalInventoryValue } from '../calculators/inventoryValueCalculator.js';
import { calculateTurnoverRatio } from '../calculators/turnoverCalculator.js';
import { aggregateLowStock } from './lowStockAggregator.js';
import { aggregateOutOfStock } from './outOfStockAggregator.js';
import { aggregateDeadStock } from './deadStockAggregator.js';
import { aggregateSlowMoving } from './slowMovingAggregator.js';
import { aggregateFastMoving } from './fastMovingAggregator.js';
import { aggregateOverstock } from './overstockAggregator.js';

/**
 * @param {object[]} itemMetricsList from metrics/itemMetrics.js
 * @param {object} [opts] forwarded to every movement aggregator (deadStockDays,
 *   slowMovingMaxTurnsPerYear, fastMovingMinTurnsPerYear, overstockDaysOfCover),
 *   plus opts.lookbackDays (the snapshot's own lookback window, needed to
 *   annualize the company-wide turnover ratio)
 */
export function aggregateInventorySummary (itemMetricsList, opts = {}) {
  const trackedItems = itemMetricsList.filter((m) => m.trackStock);
  const totalInventoryValue = calculateTotalInventoryValue(itemMetricsList);
  const totalCogsInWindow = trackedItems.reduce((sum, m) => sum + (m.cogsInWindow || 0), 0);

  const lowStock = aggregateLowStock(itemMetricsList);
  const outOfStock = aggregateOutOfStock(itemMetricsList);
  const deadStock = aggregateDeadStock(itemMetricsList, opts);
  const slowMoving = aggregateSlowMoving(itemMetricsList, opts);
  const fastMoving = aggregateFastMoving(itemMetricsList, opts);
  const overstock = aggregateOverstock(itemMetricsList, opts);

  return {
    itemCount: itemMetricsList.length,
    trackedItemCount: trackedItems.length,
    totalStockQty: trackedItems.reduce((sum, m) => sum + m.currentStock, 0),
    totalInventoryValue,
    avgInventoryValuePerItem: trackedItems.length ? totalInventoryValue / trackedItems.length : 0,
    totalCogsInWindow,
    overallTurnoverRatio: calculateTurnoverRatio({
      cogsInWindow: totalCogsInWindow,
      inventoryValue: totalInventoryValue,
      lookbackDays: opts.lookbackDays
    }),
    lowStockCount: lowStock.length,
    outOfStockCount: outOfStock.length,
    deadStockCount: deadStock.length,
    slowMovingCount: slowMoving.length,
    fastMovingCount: fastMoving.length,
    overstockCount: overstock.length
  };
}
