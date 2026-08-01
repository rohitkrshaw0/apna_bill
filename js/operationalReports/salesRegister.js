// =====================================================================
// operationalReports/salesRegister.js
// Milestone 14B.2's own Report Definition + registration for the Sales
// Register -- the first real report built on top of the Reporting
// Platform Foundation (14A). Lives outside js/services/reporting/: that
// platform's own registry/contract/lifecycle/shell files are not modified
// to add this report. reportRegistry.register() IS this platform's own
// extension point (docs/architecture/reporting-platform-architecture.md
// §11/§13) -- calling it from here is the sanctioned way to add a report,
// not a workaround.
// =====================================================================

import {
  reportRegistry, createReportDefinition,
  REPORT_CATEGORIES, REPORT_DATA_SOURCES, REPORT_FILTER_KEYS, REPORT_EXPORT_FORMATS
} from '../services/reporting/index.js';

export const salesRegisterReportDefinition = createReportDefinition({
  id: 'sales-register',
  title: 'Sales Register',
  description: 'Dated, filterable listing of every sale invoice -- customer, invoice number, status and payment status -- with pagination, sorting, print and CSV export.',
  category: REPORT_CATEGORIES.SALES,
  dataSource: REPORT_DATA_SOURCES.ERP,
  filters: [
    REPORT_FILTER_KEYS.DATE_RANGE,
    REPORT_FILTER_KEYS.CUSTOMER,
    REPORT_FILTER_KEYS.STATUS,
    REPORT_FILTER_KEYS.PAYMENT_STATUS,
    REPORT_FILTER_KEYS.SEARCH
  ],
  exportFormats: [REPORT_EXPORT_FORMATS.CSV, REPORT_EXPORT_FORMATS.PRINT],
  href: 'sales-register.html'
});

/**
 * Idempotent -- safe to call from every page that needs this report
 * registered against the shared, page-local reportRegistry instance (the
 * Reports hub, and this report's own screen both do, since this is a
 * no-bundler multi-page app with no runtime shared across navigations).
 */
export function registerSalesRegisterReport () {
  if (!reportRegistry.has(salesRegisterReportDefinition.id)) {
    reportRegistry.register(salesRegisterReportDefinition);
  }
  return salesRegisterReportDefinition;
}

// Milestone 14B.5: a repository architecture audit (performed before
// writing any code) found "Customer Ledger" (a dated transaction listing
// for one customer) is not materially different from the Sales Register
// itself -- sales-register.html already has a Customer filter, and
// js/salesRegisterData.js's listSalesRegisterRows()/listAllSalesRegisterRows()
// already accept a partyId. There is no distinguishing default (unlike
// Low Stock/Negative Stock's fixed-enum presets) to parameterize via a
// query string -- "which customer" is a per-record, dynamic choice the
// existing Customer filter already makes. This ReportDefinition exists
// purely so Customer Ledger is independently discoverable under the
// Customer Reports category in the Reports hub; its href points at the
// SAME, unmodified sales-register.html screen. No new provider, no new
// screen, no new query-param handling.
export const customerLedgerReportDefinition = createReportDefinition({
  id: 'customer-ledger',
  title: 'Customer Ledger',
  description: 'Dated transaction history for one customer -- the Sales Register\'s own Customer filter, discoverable here under Customer Reports. Same screen, same data, no separate implementation.',
  category: REPORT_CATEGORIES.CUSTOMER,
  dataSource: REPORT_DATA_SOURCES.ERP,
  filters: [
    REPORT_FILTER_KEYS.DATE_RANGE,
    REPORT_FILTER_KEYS.CUSTOMER,
    REPORT_FILTER_KEYS.STATUS,
    REPORT_FILTER_KEYS.PAYMENT_STATUS,
    REPORT_FILTER_KEYS.SEARCH
  ],
  exportFormats: [REPORT_EXPORT_FORMATS.CSV, REPORT_EXPORT_FORMATS.PRINT],
  href: 'sales-register.html'
});

/** Idempotent, same pattern -- see this file's own header comment for why this shares sales-register.html rather than getting its own screen. */
export function registerCustomerLedgerReport () {
  if (!reportRegistry.has(customerLedgerReportDefinition.id)) {
    reportRegistry.register(customerLedgerReportDefinition);
  }
  return customerLedgerReportDefinition;
}
