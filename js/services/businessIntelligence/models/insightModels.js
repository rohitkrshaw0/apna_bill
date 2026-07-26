// models/insightModels.js
// Structured, frozen response shapes (milestone brief section "Insight
// Models": "Avoid returning raw arrays whenever structured models are more
// appropriate"). This file does no calculation of its own -- it only
// assembles already-computed pieces (from aggregators/, calculators/,
// recommendations/) into one deep-frozen object per public API call.

import { deepFreeze } from '../shared/freezeDeep.js';

/**
 * @param {object} args
 * @param {string} args.companyId
 * @param {string} args.generatedAt ISO-8601
 * @param {number} args.lookbackDays
 * @param {object} args.summary aggregators/inventorySummaryAggregator.js output
 * @returns {object} the InventoryValue model
 */
export function buildInventoryValueModel ({ companyId, generatedAt, lookbackDays, summary }) {
  return deepFreeze({
    companyId,
    generatedAt,
    lookbackDays,
    totalInventoryValue: summary.totalInventoryValue,
    avgInventoryValuePerItem: summary.avgInventoryValuePerItem,
    trackedItemCount: summary.trackedItemCount,
    totalStockQty: summary.totalStockQty
  });
}

/**
 * The one, complete Inventory Insight model -- exactly the shape the
 * milestone brief's own "Insight Models" section illustrates:
 * { inventoryValue, stockTurnover, lowStock, deadStock, slowMoving,
 *   fastMoving, categoryPerformance, recommendations }.
 *
 * @param {object} args
 * @param {string} args.companyId
 * @param {string} args.generatedAt
 * @param {number} args.lookbackDays
 * @param {object} args.summary inventorySummaryAggregator output
 * @param {object[]} args.lowStock
 * @param {object[]} args.outOfStock
 * @param {object[]} args.deadStock
 * @param {object[]} args.slowMoving
 * @param {object[]} args.fastMoving
 * @param {object[]} args.overstock
 * @param {object[]} args.categoryPerformance
 * @param {object} args.reorderSummary
 * @returns {object} the frozen InventoryInsight model
 */
export function buildInventoryInsightModel ({
  companyId, generatedAt, lookbackDays, summary,
  lowStock, outOfStock, deadStock, slowMoving, fastMoving, overstock,
  categoryPerformance, reorderSummary
}) {
  return deepFreeze({
    companyId,
    generatedAt,
    lookbackDays,
    inventoryValue: {
      totalInventoryValue: summary.totalInventoryValue,
      avgInventoryValuePerItem: summary.avgInventoryValuePerItem,
      trackedItemCount: summary.trackedItemCount,
      totalStockQty: summary.totalStockQty
    },
    stockTurnover: {
      overallTurnoverRatio: summary.overallTurnoverRatio,
      totalCogsInWindow: summary.totalCogsInWindow,
      lookbackDays
    },
    summary,
    lowStock,
    outOfStock,
    deadStock,
    slowMoving,
    fastMoving,
    overstock,
    categoryPerformance,
    recommendations: reorderSummary
  });
}
