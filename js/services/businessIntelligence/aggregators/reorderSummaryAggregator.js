// aggregators/reorderSummaryAggregator.js
import { buildReorderRecommendations } from '../recommendations/reorderRecommendations.js';

const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2, none: 3 };

/**
 * @param {object[]} itemMetricsList from metrics/itemMetrics.js
 * @param {object} [opts] forwarded to recommendations/reorderRecommendations.js
 * @returns {object} { recommendations: object[] (actionable only, most urgent first), urgentCount, highCount, normalCount, potentialExcessCount, potentialDeadCount }
 */
export function aggregateReorderSummary (itemMetricsList, opts = {}) {
  const all = buildReorderRecommendations(itemMetricsList, opts);
  const actionable = all.filter((r) => r.priority !== 'none' || r.potentialExcessInventory || r.potentialDeadInventory);
  actionable.sort((a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) || b.recommendedReorderQty - a.recommendedReorderQty);

  return {
    recommendations: actionable,
    urgentCount: all.filter((r) => r.priority === 'urgent').length,
    highCount: all.filter((r) => r.priority === 'high').length,
    normalCount: all.filter((r) => r.priority === 'normal').length,
    potentialExcessCount: all.filter((r) => r.potentialExcessInventory).length,
    potentialDeadCount: all.filter((r) => r.potentialDeadInventory).length
  };
}
