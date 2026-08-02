// =====================================================================
// analysisReports/businessPerformanceSummary.js
// Milestone 14C.6's own Report Definition + registration for Business
// Performance Summary.
//
// Business Intelligence Consumption Ledger (ADR-0006):
//   Public API consumed:   businessDashboard.getBusinessSnapshot()
//   Intelligence module:   Business Dashboard (12F), composing all five
//                           sibling domain APIs unmodified
//   Zero calculation:      yes -- BusinessSnapshot is assembled-only
//                           (business-intelligence-platform.md §3: "Zero
//                           new metrics, calculators, or aggregators")
//   Presentation-only:     yes -- grouped read-only KPI/summary display,
//                           print + a two-column Metric,Value CSV of
//                           already-computed fields only. No filters: a
//                           whole-company snapshot has nothing to filter.
//
// This is a Reporting Platform consumer, NOT an extension of
// dashboard.html (13C, Executive Command Center) -- dashboard.html is not
// modified, not imported, and not refactored by this report. Both consume
// the identical public API (businessDashboard.getBusinessSnapshot());
// they exist for different purposes: dashboard.html is interactive
// operational monitoring (no print, no export, no filters, hard top-5
// slices), this report is a printable/exportable/distributable/archival
// artifact (full figures, print via css/report-print.css, CSV export) --
// a different consumption model, the same relationship
// business-intelligence-platform.md §6 sanctions for "any future
// consumer... a scheduled report, a different UI." Not an Executive
// Report -- Executive Reporting is reserved for a future milestone.
//
// category: REPORT_CATEGORIES.BUSINESS_INTELLIGENCE (ADR-0006 decision 1).
// No data provider file (ADR-0006 decision 2).
// =====================================================================

import {
  reportRegistry, createReportDefinition,
  REPORT_CATEGORIES, REPORT_DATA_SOURCES, REPORT_EXPORT_FORMATS
} from '../services/reporting/index.js';

export const businessPerformanceSummaryReportDefinition = createReportDefinition({
  id: 'business-performance-summary',
  title: 'Business Performance Summary',
  description: 'A printable, exportable whole-company snapshot -- inventory, purchase, sales, pricing, and supplier figures -- sourced from the existing Business Snapshot API, not recalculated here. Not an extension of the Dashboard: same data, a different (archival) consumption model.',
  category: REPORT_CATEGORIES.BUSINESS_INTELLIGENCE,
  dataSource: REPORT_DATA_SOURCES.BUSINESS_INTELLIGENCE,
  filters: [],
  exportFormats: [REPORT_EXPORT_FORMATS.CSV, REPORT_EXPORT_FORMATS.PRINT],
  href: 'business-performance-summary.html'
});

/**
 * Idempotent -- safe to call from every page that needs this report
 * registered against the shared, page-local reportRegistry instance.
 */
export function registerBusinessPerformanceSummaryReport () {
  if (!reportRegistry.has(businessPerformanceSummaryReportDefinition.id)) {
    reportRegistry.register(businessPerformanceSummaryReportDefinition);
  }
  return businessPerformanceSummaryReportDefinition;
}
