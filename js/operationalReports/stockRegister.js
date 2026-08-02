// =====================================================================
// operationalReports/stockRegister.js
// Milestone 14B.4A's own Report Definition + registration for the Stock
// Register -- the first Inventory Reports (14B.4) report, and the
// canonical reference implementation the rest of 14B.4 (Current Stock,
// Low Stock, Negative Stock, Stock Movement Register) will follow.
// Reuses STATUS for stock_ledger's own txn_type (the same "reuse STATUS
// for this schema's own document/record-kind column" precedent the Sales
// Register set for invoices.doc_type), and the new ITEM filter key
// (contracts/reportContract.js) for "which item."
// =====================================================================

import {
  reportRegistry, createReportDefinition,
  REPORT_CATEGORIES, REPORT_DATA_SOURCES, REPORT_FILTER_KEYS, REPORT_EXPORT_FORMATS
} from '../services/reporting/index.js';

export const stockRegisterReportDefinition = createReportDefinition({
  id: 'stock-register',
  title: 'Stock Register',
  description: 'Dated, filterable listing of every stock movement -- item, batch, and transaction type -- with pagination, sorting, print and CSV export.',
  category: REPORT_CATEGORIES.INVENTORY,
  dataSource: REPORT_DATA_SOURCES.ERP,
  filters: [
    REPORT_FILTER_KEYS.DATE_RANGE,
    REPORT_FILTER_KEYS.ITEM,
    REPORT_FILTER_KEYS.STATUS,
    REPORT_FILTER_KEYS.SEARCH
  ],
  exportFormats: [REPORT_EXPORT_FORMATS.CSV, REPORT_EXPORT_FORMATS.PRINT],
  href: 'stock-register.html'
});

/**
 * Idempotent -- safe to call from every page that needs this report
 * registered against the shared, page-local reportRegistry instance.
 */
export function registerStockRegisterReport () {
  if (!reportRegistry.has(stockRegisterReportDefinition.id)) {
    reportRegistry.register(stockRegisterReportDefinition);
  }
  return stockRegisterReportDefinition;
}
