// aggregators/categorySummaryAggregator.js
import { groupMetricsByCategory } from '../calculators/categoryCalculator.js';
import { calculateTotalInventoryValue } from '../calculators/inventoryValueCalculator.js';

/**
 * @param {object[]} itemMetricsList from metrics/itemMetrics.js
 * @returns {object[]} one row per category (hsn_sac proxy -- see calculators/categoryCalculator.js), highest inventory value first
 */
export function aggregateCategorySummary (itemMetricsList) {
  const grouped = groupMetricsByCategory(itemMetricsList);
  const rows = [];

  for (const [category, items] of grouped) {
    const tracked = items.filter((m) => m.trackStock);
    const turnoverValues = items.map((m) => m.turnoverRatio).filter((v) => v !== null);

    rows.push({
      category,
      itemCount: items.length,
      totalStockQty: tracked.reduce((sum, m) => sum + m.currentStock, 0),
      totalInventoryValue: calculateTotalInventoryValue(items),
      qtySoldInWindow: items.reduce((sum, m) => sum + m.qtySoldInWindow, 0),
      avgTurnoverRatio: turnoverValues.length ? turnoverValues.reduce((s, v) => s + v, 0) / turnoverValues.length : null
    });
  }

  return rows.sort((a, b) => b.totalInventoryValue - a.totalInventoryValue);
}
