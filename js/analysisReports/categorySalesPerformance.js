// =====================================================================
// analysisReports/categorySalesPerformance.js
// Milestone 14C.2's own Report Definition + registration for Category
// Sales Performance.
//
// Business Intelligence Consumption Ledger (ADR-0006):
//   Public API consumed:   salesIntelligence.getCategoryPerformance()
//   Intelligence module:   Sales Intelligence (12C),
//                           aggregators/categorySalesSummaryAggregator.js
//   Zero calculation:      yes -- CategorySummary (Sales variant) rows
//                           arrive pre-aggregated (itemCount, totalUnitsSold,
//                           totalNetSales, avgSellingPrice)
//   Presentation-only:     yes -- search by category name, sort, no
//                           calculation of any kind
//
// Deliberately single-domain (Sales only), per the repository audit
// (docs/architecture/ADR/0006-business-analysis-report-pattern.md, §1.5 of
// the milestone plan): joining this against Inventory/Purchase/Pricing's
// own CategorySummary variants would be Business Intelligence composition,
// not presentation, and is out of scope for Reporting.
//
// Disclosed BI limitation carried unmodified from the underlying
// aggregator: "category" is an hsn_sac proxy, not a true taxonomy -- this
// report does not attempt to solve that; it is a pre-existing, documented
// Business Intelligence limitation.
//
// category: REPORT_CATEGORIES.BUSINESS_INTELLIGENCE (ADR-0006 decision 1).
// No data provider file (ADR-0006 decision 2).
// =====================================================================

import {
  reportRegistry, createReportDefinition,
  REPORT_CATEGORIES, REPORT_DATA_SOURCES, REPORT_FILTER_KEYS, REPORT_EXPORT_FORMATS
} from '../services/reporting/index.js';

export const categorySalesPerformanceReportDefinition = createReportDefinition({
  id: 'category-sales-performance',
  title: 'Category Sales Performance',
  description: 'Per-category unit and revenue totals -- sourced from Business Intelligence, not recalculated here. Category is an hsn_sac proxy, not a true product taxonomy (a pre-existing, disclosed Business Intelligence limitation).',
  category: REPORT_CATEGORIES.BUSINESS_INTELLIGENCE,
  dataSource: REPORT_DATA_SOURCES.BUSINESS_INTELLIGENCE,
  filters: [
    REPORT_FILTER_KEYS.SEARCH
  ],
  exportFormats: [REPORT_EXPORT_FORMATS.CSV, REPORT_EXPORT_FORMATS.PRINT],
  href: 'category-sales-performance.html'
});

/**
 * Idempotent -- safe to call from every page that needs this report
 * registered against the shared, page-local reportRegistry instance.
 */
export function registerCategorySalesPerformanceReport () {
  if (!reportRegistry.has(categorySalesPerformanceReportDefinition.id)) {
    reportRegistry.register(categorySalesPerformanceReportDefinition);
  }
  return categorySalesPerformanceReportDefinition;
}
