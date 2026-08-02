// =====================================================================
// analysisReports/productPerformance.js
// Milestone 14C.1's own Report Definition + registration for Product
// Performance Analysis -- the reference implementation every later 14C
// report follows, the role Sales Register played in 14B.
//
// Business Intelligence Consumption Ledger (ADR-0006):
//   Public API consumed:   salesIntelligence.getSalesMetricsSnapshot() -> .salesMetrics
//   Intelligence module:   Sales Intelligence (12C), metrics/salesMetrics.js
//   Zero calculation:      yes -- SalesMetric rows arrive fully computed
//                           (netSales, unitsSold, grossMarginPct, costTrend, ...)
//   Presentation-only:     yes -- search by name/code, filter by category and
//                           by sales trend band (a presentation bucket over
//                           the already-computed costTrend field, not a new
//                           classification), sort, paginate, print, CSV
//
// category: REPORT_CATEGORIES.BUSINESS_INTELLIGENCE, not SALES -- per
// ADR-0006 decision 1: this report presents an already-computed Sales
// Intelligence ranking, not a listing of this company's own sale records
// (that report already exists: Sales Register, 14B.2).
//
// No data provider file exists for this report -- per ADR-0006 decision 2,
// a BUSINESS_INTELLIGENCE-sourced report calls the existing public API
// directly; ADR-0005's provider pattern governs ERP-sourced reports only.
// =====================================================================

import {
  reportRegistry, createReportDefinition,
  REPORT_CATEGORIES, REPORT_DATA_SOURCES, REPORT_FILTER_KEYS, REPORT_EXPORT_FORMATS
} from '../services/reporting/index.js';

export const productPerformanceReportDefinition = createReportDefinition({
  id: 'product-performance',
  title: 'Product Performance Analysis',
  description: 'Per-item sales performance -- net sales, units sold, gross margin, sales velocity, and sales trend -- sourced from Business Intelligence, not recalculated here. Answers which products perform best and worst.',
  category: REPORT_CATEGORIES.BUSINESS_INTELLIGENCE,
  dataSource: REPORT_DATA_SOURCES.BUSINESS_INTELLIGENCE,
  filters: [
    REPORT_FILTER_KEYS.CATEGORY,
    REPORT_FILTER_KEYS.STATUS,
    REPORT_FILTER_KEYS.SEARCH
  ],
  exportFormats: [REPORT_EXPORT_FORMATS.CSV, REPORT_EXPORT_FORMATS.PRINT],
  href: 'product-performance.html'
});

/**
 * Idempotent -- safe to call from every page that needs this report
 * registered against the shared, page-local reportRegistry instance.
 */
export function registerProductPerformanceReport () {
  if (!reportRegistry.has(productPerformanceReportDefinition.id)) {
    reportRegistry.register(productPerformanceReportDefinition);
  }
  return productPerformanceReportDefinition;
}
