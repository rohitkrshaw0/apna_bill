// =====================================================================
// operationalReports/customerOutstanding.js
// Milestone 14B.5's own Report Definition + registration for Outstanding
// Summary -- the third Customer Reports item, and the first ERP-sourced
// report reading js/customerOutstandingData.js (the first customer-domain
// data provider in this app). dataSource: ERP (ADR-0004 path 2) --
// parties.current_balance is a directly-stored ERP column, not a
// Business Intelligence computation (no customerIntelligence domain
// exists; Sales Intelligence's own customerMetrics has no balance field
// at all -- see js/customerOutstandingData.js's own header comment for
// the full schema validation).
// =====================================================================

import {
  reportRegistry, createReportDefinition,
  REPORT_CATEGORIES, REPORT_DATA_SOURCES, REPORT_FILTER_KEYS, REPORT_EXPORT_FORMATS
} from '../services/reporting/index.js';

export const customerOutstandingReportDefinition = createReportDefinition({
  id: 'outstanding-summary',
  title: 'Outstanding Summary',
  description: 'Every customer\'s current outstanding balance -- read directly from the ERP\'s own authoritative running balance, never recalculated -- with search, sorting, print and CSV export.',
  category: REPORT_CATEGORIES.CUSTOMER,
  dataSource: REPORT_DATA_SOURCES.ERP,
  filters: [
    REPORT_FILTER_KEYS.STATUS,
    REPORT_FILTER_KEYS.SEARCH
  ],
  exportFormats: [REPORT_EXPORT_FORMATS.CSV, REPORT_EXPORT_FORMATS.PRINT],
  href: 'outstanding-summary.html'
});

/**
 * Idempotent -- safe to call from every page that needs this report
 * registered against the shared, page-local reportRegistry instance.
 */
export function registerCustomerOutstandingReport () {
  if (!reportRegistry.has(customerOutstandingReportDefinition.id)) {
    reportRegistry.register(customerOutstandingReportDefinition);
  }
  return customerOutstandingReportDefinition;
}
