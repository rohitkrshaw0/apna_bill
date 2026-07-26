// recommendations/reorderRecommendations.js
// Recommendations ONLY (milestone brief's own words): "recommended reorder
// quantity / priority / timing", "potential excess inventory", "potential
// dead inventory". This file never creates a purchase order, never
// modifies inventory, and never automates purchasing -- it returns a
// plain, structured suggestion a human (or a future Purchase Intelligence
// milestone, 12B, not built here) decides what to do with.

import { isOutOfStock, isLowStock, isOverstock, isDeadStock, MOVEMENT_DEFAULTS } from '../calculators/movementCalculator.js';
import { REORDER_DEFAULTS } from '../shared/config.js';

/**
 * @param {object} m one item metric from metrics/itemMetrics.js
 * @param {object} [opts] REORDER_DEFAULTS overrides (leadTimeDays, safetyStockDays, noVelocityRestockMultiplier), plus MOVEMENT_DEFAULTS overrides forwarded to the movement predicates
 * @returns {object} a single item's reorder recommendation
 */
export function buildReorderRecommendation (m, opts = {}) {
  const leadTimeDays = opts.leadTimeDays ?? REORDER_DEFAULTS.leadTimeDays;
  const safetyStockDays = opts.safetyStockDays ?? REORDER_DEFAULTS.safetyStockDays;

  const noVelocityRestockMultiplier = opts.noVelocityRestockMultiplier ?? REORDER_DEFAULTS.noVelocityRestockMultiplier;
  const coverWindowDays = leadTimeDays + safetyStockDays;
  const targetStockLevel = m.dailySalesVelocity > 0
    ? Math.ceil(m.dailySalesVelocity * coverWindowDays)
    : m.lowStockThreshold > 0 ? m.lowStockThreshold * noVelocityRestockMultiplier : 0;

  const recommendedReorderQty = m.trackStock ? Math.max(0, targetStockLevel - m.currentStock) : 0;

  const outOfStock = isOutOfStock(m);
  const lowStock = isLowStock(m);
  const nearingThreshold = m.daysOfCover !== null && m.daysOfCover <= coverWindowDays;

  let priority = 'none';
  let timing = 'none';
  if (outOfStock || (lowStock && m.daysOfCover !== null && m.daysOfCover <= leadTimeDays)) {
    priority = 'urgent';
    timing = 'reorderNow';
  } else if (lowStock) {
    priority = 'high';
    timing = 'reorderNow';
  } else if (nearingThreshold) {
    priority = 'normal';
    timing = 'reorderSoon';
  }

  return {
    itemId: m.itemId,
    name: m.name,
    code: m.code,
    currentStock: m.currentStock,
    lowStockThreshold: m.lowStockThreshold,
    targetStockLevel,
    recommendedReorderQty,
    priority,
    timing,
    potentialExcessInventory: isOverstock(m, opts),
    potentialDeadInventory: isDeadStock(m, opts)
  };
}

/**
 * @param {object[]} itemMetricsList
 * @param {object} [opts]
 * @returns {object[]} recommendations for every stock-tracked item, whether actionable or not (see reorderSummaryAggregator.js to narrow to actionable-only)
 */
export function buildReorderRecommendations (itemMetricsList, opts = {}) {
  return itemMetricsList
    .filter((m) => m.trackStock)
    .map((m) => buildReorderRecommendation(m, opts));
}

export { MOVEMENT_DEFAULTS, REORDER_DEFAULTS };
