// =====================================================================
// operationalReports/purchaseRegister.js
// Milestone 14B.3's own Report Definition + registration for the
// Purchase Register -- same shape as operationalReports/salesRegister.js
// (14B.2), the canonical reference implementation. Lives outside
// js/services/reporting/, for the same reason: reportRegistry.register()
// is this platform's own extension point (architecture doc §11/§13); no
// platform file needs to change to add this report.
//
// No STATUS filter is declared here (unlike the Sales Register) --
// purchases has no doc_type column, so there is no Sale/Sale
// Return/Quotation-like dimension to filter by. See
// js/purchaseRegisterData.js's own header comment.
// =====================================================================

import {
  reportRegistry, createReportDefinition,
  REPORT_CATEGORIES, REPORT_DATA_SOURCES, REPORT_FILTER_KEYS, REPORT_EXPORT_FORMATS
} from '../services/reporting/index.js';

export const purchaseRegisterReportDefinition = createReportDefinition({
  id: 'purchase-register',
  title: 'Purchase Register',
  description: 'Dated, filterable listing of every purchase bill -- supplier and payment status -- with pagination, sorting, print and CSV export.',
  category: REPORT_CATEGORIES.PURCHASE,
  dataSource: REPORT_DATA_SOURCES.ERP,
  filters: [
    REPORT_FILTER_KEYS.DATE_RANGE,
    REPORT_FILTER_KEYS.SUPPLIER,
    REPORT_FILTER_KEYS.PAYMENT_STATUS,
    REPORT_FILTER_KEYS.SEARCH
  ],
  exportFormats: [REPORT_EXPORT_FORMATS.CSV, REPORT_EXPORT_FORMATS.PRINT],
  href: 'purchase-register.html'
});

/**
 * Idempotent -- safe to call from every page that needs this report
 * registered against the shared, page-local reportRegistry instance.
 */
export function registerPurchaseRegisterReport () {
  if (!reportRegistry.has(purchaseRegisterReportDefinition.id)) {
    reportRegistry.register(purchaseRegisterReportDefinition);
  }
  return purchaseRegisterReportDefinition;
}

// Milestone 14B.6: a repository architecture audit (performed before
// writing any code) found "Supplier Ledger" (a dated transaction listing
// for one supplier) is not materially different from the Purchase
// Register itself -- purchase-register.html already has a Supplier
// filter, and js/purchaseRegisterData.js's listPurchaseRegisterRows()/
// listAllPurchaseRegisterRows() already accept a supplierId. The same
// pattern Customer Ledger already established for Sales Register
// (js/operationalReports/salesRegister.js). This ReportDefinition exists
// purely so Supplier Ledger is independently discoverable under the
// Supplier Reports category; its href points at the SAME, unmodified
// purchase-register.html screen. No new provider, no new screen.
export const supplierLedgerReportDefinition = createReportDefinition({
  id: 'supplier-ledger',
  title: 'Supplier Ledger',
  description: 'Dated purchase history for one supplier -- the Purchase Register\'s own Supplier filter, discoverable here under Supplier Reports. Same screen, same data, no separate implementation.',
  category: REPORT_CATEGORIES.SUPPLIER,
  dataSource: REPORT_DATA_SOURCES.ERP,
  filters: [
    REPORT_FILTER_KEYS.DATE_RANGE,
    REPORT_FILTER_KEYS.SUPPLIER,
    REPORT_FILTER_KEYS.PAYMENT_STATUS,
    REPORT_FILTER_KEYS.SEARCH
  ],
  exportFormats: [REPORT_EXPORT_FORMATS.CSV, REPORT_EXPORT_FORMATS.PRINT],
  href: 'purchase-register.html'
});

/** Idempotent, same pattern -- see this file's own comment for why this shares purchase-register.html rather than getting its own screen. */
export function registerSupplierLedgerReport () {
  if (!reportRegistry.has(supplierLedgerReportDefinition.id)) {
    reportRegistry.register(supplierLedgerReportDefinition);
  }
  return supplierLedgerReportDefinition;
}
