// =====================================================================
// analysisReports/salesTrendAnalysis.js
// Milestone 14C.2's own Report Definition + registration for Sales Trend
// Analysis.
//
// Business Intelligence Consumption Ledger (ADR-0006):
//   Public API consumed:   salesIntelligence.getSeasonality()
//   Intelligence module:   Sales Intelligence (12C),
//                           aggregators/seasonalitySummaryAggregator.js
//   Zero calculation:      yes -- a monthly {month, netSales, unitsSold,
//                           orderCount} series returned already aggregated
//   Presentation-only:     yes -- chronological table, print/CSV only
//
// Deliberately declares NO filters -- a 12-month series has nothing honest
// to filter, search, or sort (it is already chronological, and reordering a
// time series destroys the one thing it shows). This is a genuine, disclosed
// deviation from every other 14C/14B report's filter bar, not an omission.
//
// category: REPORT_CATEGORIES.BUSINESS_INTELLIGENCE (ADR-0006 decision 1).
// No data provider file (ADR-0006 decision 2).
// =====================================================================

import {
  reportRegistry, createReportDefinition,
  REPORT_CATEGORIES, REPORT_DATA_SOURCES, REPORT_EXPORT_FORMATS
} from '../services/reporting/index.js';

export const salesTrendAnalysisReportDefinition = createReportDefinition({
  id: 'sales-trend-analysis',
  title: 'Sales Trend Analysis',
  description: 'Monthly net sales, units sold, and order count across the lookback window -- sourced from Business Intelligence, not recalculated here. A time series, not a filterable list: no filters apply.',
  category: REPORT_CATEGORIES.BUSINESS_INTELLIGENCE,
  dataSource: REPORT_DATA_SOURCES.BUSINESS_INTELLIGENCE,
  filters: [],
  exportFormats: [REPORT_EXPORT_FORMATS.CSV, REPORT_EXPORT_FORMATS.PRINT],
  href: 'sales-trend-analysis.html'
});

/**
 * Idempotent -- safe to call from every page that needs this report
 * registered against the shared, page-local reportRegistry instance.
 */
export function registerSalesTrendAnalysisReport () {
  if (!reportRegistry.has(salesTrendAnalysisReportDefinition.id)) {
    reportRegistry.register(salesTrendAnalysisReportDefinition);
  }
  return salesTrendAnalysisReportDefinition;
}
