// =====================================================================
// analysisReports/purchaseAnalysis.js
// Milestone 14C.3's own Report Definition + registration for Purchase
// Analysis -- the first consumer of `purchaseIntelligence` anywhere in
// this application (14 public methods, zero call sites before this).
//
// Business Intelligence Consumption Ledger (ADR-0006):
//   Public API consumed:   purchaseIntelligence.getPurchaseMetricsSnapshot()
//                           -> .purchaseMetrics
//   Intelligence module:   Purchase Intelligence (12B), metrics/purchaseMetrics.js
//   Zero calculation:      yes -- PurchaseMetric rows arrive fully computed
//                           (purchaseValue, avgPurchasePrice, costTrend,
//                           purchaseFrequencyPerYear, ...)
//   Presentation-only:     yes -- search by name, filter by category and by
//                           cost trend band (a presentation bucket over the
//                           already-computed costTrend field, not a new
//                           classification), sort, paginate, print, CSV
//
// Not the same report as Purchase Register (14B.3, ERP-sourced, one row
// per purchase bill). This is one row per ITEM, ranked by purchasing
// behavior -- the question "which items cost us the most, and where are
// purchase costs trending" that no row-level bill listing answers.
//
// category: REPORT_CATEGORIES.BUSINESS_INTELLIGENCE (ADR-0006 decision 1).
// No data provider file (ADR-0006 decision 2).
// =====================================================================

import {
  reportRegistry, createReportDefinition,
  REPORT_CATEGORIES, REPORT_DATA_SOURCES, REPORT_FILTER_KEYS, REPORT_EXPORT_FORMATS
} from '../services/reporting/index.js';

export const purchaseAnalysisReportDefinition = createReportDefinition({
  id: 'purchase-analysis',
  title: 'Purchase Analysis',
  description: 'Per-item purchasing behavior -- purchase value, quantity, average price, and cost trend -- sourced from Business Intelligence, not recalculated here. Answers which items cost the most, and where purchase costs are trending.',
  category: REPORT_CATEGORIES.BUSINESS_INTELLIGENCE,
  dataSource: REPORT_DATA_SOURCES.BUSINESS_INTELLIGENCE,
  filters: [
    REPORT_FILTER_KEYS.CATEGORY,
    REPORT_FILTER_KEYS.STATUS,
    REPORT_FILTER_KEYS.SEARCH
  ],
  exportFormats: [REPORT_EXPORT_FORMATS.CSV, REPORT_EXPORT_FORMATS.PRINT],
  href: 'purchase-analysis.html'
});

/**
 * Idempotent -- safe to call from every page that needs this report
 * registered against the shared, page-local reportRegistry instance.
 */
export function registerPurchaseAnalysisReport () {
  if (!reportRegistry.has(purchaseAnalysisReportDefinition.id)) {
    reportRegistry.register(purchaseAnalysisReportDefinition);
  }
  return purchaseAnalysisReportDefinition;
}
