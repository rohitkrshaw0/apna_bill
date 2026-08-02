// =====================================================================
// operationalReports/supplierOutstanding.js
// Milestone 14B.6's own Report Definition + registration for Supplier
// Outstanding. dataSource: ERP (ADR-0004 path 2), same authoritative
// column (parties.current_balance) Outstanding Summary (14B.5B) already
// validated -- but, per the report architecture audit performed before
// writing any code, the REUSE decision is genuinely different here:
// suppliers.js's own listSuppliers() already returns current_balance and
// already supports sort:'balance' and full server-side pagination
// (limit/offset/count:'exact'). No new provider file exists for this
// report, unlike Outstanding Summary's own js/customerOutstandingData.js
// (which was needed because no customer-listing infrastructure existed
// at all). This report's own screen calls listSuppliers() directly.
//
// One declared difference from Outstanding Summary: no Balance Status
// filter. listSuppliers() has no such parameter, and this report does
// not modify suppliers.js (frozen, owned by the Supplier Management
// screen) to add one, nor fake server-side filtering by silently capping
// the result set -- either would risk a financial report quietly
// omitting real suppliers. Balance status is still shown per row, as a
// badge, computed client-side from the already-loaded current_balance --
// presentation only, just not filterable, the same "declare only what's
// honestly supported" discipline Purchase Register already applied when
// it declined a STATUS filter with no real doc_type analog.
// =====================================================================

import {
  reportRegistry, createReportDefinition,
  REPORT_CATEGORIES, REPORT_DATA_SOURCES, REPORT_FILTER_KEYS, REPORT_EXPORT_FORMATS
} from '../services/reporting/index.js';

export const supplierOutstandingReportDefinition = createReportDefinition({
  id: 'supplier-outstanding',
  title: 'Supplier Outstanding',
  description: 'Every supplier\'s current balance -- read directly from the ERP\'s own authoritative running balance via suppliers.js\'s existing listSuppliers(), never recalculated -- with search, sorting, print and CSV export.',
  category: REPORT_CATEGORIES.SUPPLIER,
  dataSource: REPORT_DATA_SOURCES.ERP,
  filters: [
    REPORT_FILTER_KEYS.SEARCH
  ],
  exportFormats: [REPORT_EXPORT_FORMATS.CSV, REPORT_EXPORT_FORMATS.PRINT],
  href: 'supplier-outstanding.html'
});

/**
 * Idempotent -- safe to call from every page that needs this report
 * registered against the shared, page-local reportRegistry instance.
 */
export function registerSupplierOutstandingReport () {
  if (!reportRegistry.has(supplierOutstandingReportDefinition.id)) {
    reportRegistry.register(supplierOutstandingReportDefinition);
  }
  return supplierOutstandingReportDefinition;
}
