// =====================================================================
// salesRegisterData.js
// Reporting Data Access layer for the Sales Register (Milestone 14B.2),
// per docs/architecture/ADR/0004-reporting-data-access-strategy.md path 2
// (REPORT_DATA_SOURCES.ERP). This is the first real ERP-sourced report,
// so the first to decide this layer's exact location -- ADR-0004 left it
// open deliberately. Placed here, flat and top-level, sibling to
// sales.js/purchases.js/items.js/suppliers.js (not nested inside
// js/services/reporting/, which stays exactly as Milestone 14A left it):
// ADR-0004's own Context section is explicit that this layer is "not part
// of the Reporting Platform Foundation's own infrastructure."
//
// Read-only: never writes to invoices/parties. Reuses the same supa
// client + getActiveCompanyId + company-scoped access pattern every other
// js/*.js data layer already uses -- no second Supabase client, no bypass
// of row-level security.
//
// One function per this report's own real, row-level need (ADR-0004: "one
// query function per report's own real need... not a speculative, generic
// report query engine"). Business Intelligence's own salesIntelligence
// exposes only company-wide aggregates/rankings, never a row-level
// invoice listing -- the gap ADR-0004 exists to close. Nothing here reads
// businessIntelligence/, and nothing here writes anywhere.
// =====================================================================

import { supa, getActiveCompanyId } from './supabaseClient.js';

export const SALES_REGISTER_SORT = Object.freeze({
  DATE_DESC: 'dateDesc',
  DATE_ASC: 'dateAsc',
  INVOICE_NO: 'invoiceNo',
  CUSTOMER_NAME: 'customerName',
  AMOUNT_DESC: 'amountDesc',
  AMOUNT_DUE_DESC: 'amountDueDesc'
});

// Mirrors invoices.doc_type's own check constraint (schema.sql) -- this is
// what the 14B brief calls the Sales Register's "Status Filter."
export const SALES_REGISTER_DOC_TYPES = Object.freeze([
  { value: 'sale', label: 'Sale' },
  { value: 'sale_return', label: 'Sale Return' },
  { value: 'quotation', label: 'Quotation' }
]);

// Derived from invoices.amount_paid/amount_due -- both already-stored
// totals the create_sale RPC writes once (sales.js's saveSaleFromCart);
// this only buckets an existing number into a label, never a new
// calculation. A distinct question from doc_type ("what kind of document
// is this") -- "has it been paid" -- so it is its own filter, not folded
// into Status.
export const SALES_REGISTER_PAYMENT_STATUS = Object.freeze({
  PAID: 'paid',
  PARTIAL: 'partial',
  UNPAID: 'unpaid'
});

export const SALES_REGISTER_PAYMENT_STATUS_OPTIONS = Object.freeze([
  { value: SALES_REGISTER_PAYMENT_STATUS.PAID, label: 'Paid' },
  { value: SALES_REGISTER_PAYMENT_STATUS.PARTIAL, label: 'Partial' },
  { value: SALES_REGISTER_PAYMENT_STATUS.UNPAID, label: 'Unpaid' }
]);

const SELECT = 'id, invoice_no, fy_label, doc_type, invoice_date, party_id, party_name_snapshot, party_phone_snapshot, grand_total, amount_paid, amount_due';

// Same looped-read page size dataExchange/xml/export/dataReaders.js
// already established for this codebase's own "genuinely new
// unpaginated/looped reads" -- reused here, not reinvented.
const PAGE_SIZE_MAX = 500;

function applyFilters (query, { dateFrom, dateTo, partyId, search, docType, paymentStatus } = {}) {
  if (dateFrom) query = query.gte('invoice_date', dateFrom);
  if (dateTo) query = query.lte('invoice_date', dateTo);
  if (partyId) query = query.eq('party_id', partyId);
  if (docType) query = query.eq('doc_type', docType);

  if (paymentStatus === SALES_REGISTER_PAYMENT_STATUS.PAID) query = query.lte('amount_due', 0);
  else if (paymentStatus === SALES_REGISTER_PAYMENT_STATUS.UNPAID) query = query.eq('amount_paid', 0).gt('amount_due', 0);
  else if (paymentStatus === SALES_REGISTER_PAYMENT_STATUS.PARTIAL) query = query.gt('amount_paid', 0).gt('amount_due', 0);

  const term = (search || '').trim();
  if (term) query = query.or(`invoice_no.ilike.%${term}%,party_name_snapshot.ilike.%${term}%,party_phone_snapshot.ilike.%${term}%`);

  return query;
}

function applySort (query, sort) {
  switch (sort) {
    case SALES_REGISTER_SORT.DATE_ASC: return query.order('invoice_date', { ascending: true }).order('created_at', { ascending: true });
    case SALES_REGISTER_SORT.INVOICE_NO: return query.order('invoice_no', { ascending: true });
    case SALES_REGISTER_SORT.CUSTOMER_NAME: return query.order('party_name_snapshot', { ascending: true, nullsFirst: false });
    case SALES_REGISTER_SORT.AMOUNT_DESC: return query.order('grand_total', { ascending: false });
    case SALES_REGISTER_SORT.AMOUNT_DUE_DESC: return query.order('amount_due', { ascending: false });
    default: return query.order('invoice_date', { ascending: false }).order('created_at', { ascending: false });
  }
}

/**
 * A dated, filtered, paginated, sortable listing of sale invoices -- the
 * Sales Register's own real row-level need (ADR-0004 path 2). Company-
 * scoped and RLS-bound exactly like every other js/*.js read.
 * @param {object} opts
 * @param {string|null} [opts.dateFrom] "YYYY-MM-DD", inclusive
 * @param {string|null} [opts.dateTo] "YYYY-MM-DD", inclusive
 * @param {string} [opts.partyId]
 * @param {string} [opts.search] matched against invoice_no / customer name / phone
 * @param {string} [opts.docType] one of SALES_REGISTER_DOC_TYPES' values
 * @param {string} [opts.paymentStatus] one of SALES_REGISTER_PAYMENT_STATUS
 * @param {string} [opts.sort] one of SALES_REGISTER_SORT
 * @param {number} [opts.limit]
 * @param {number} [opts.offset]
 * @returns {Promise<{rows: object[], count: number}>}
 */
export async function listSalesRegisterRows ({
  dateFrom = null, dateTo = null, partyId = '', search = '', docType = '', paymentStatus = '',
  sort = SALES_REGISTER_SORT.DATE_DESC, limit = 40, offset = 0
} = {}) {
  const co = getActiveCompanyId();
  let query = supa.from('invoices').select(SELECT, { count: 'exact' }).eq('company_id', co);
  query = applyFilters(query, { dateFrom, dateTo, partyId, search, docType, paymentStatus });
  query = applySort(query, sort);
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data || [], count: count || 0 };
}

/**
 * Every row matching the current filters, ignoring pagination -- backs the
 * Sales Register's own CSV export (the current FILTERED view, not just the
 * page currently loaded on screen -- Print already covers "what's on
 * screen right now"). Loops in PAGE_SIZE_MAX batches, the same
 * fetchAllPages convention dataExchange/xml/export/dataReaders.js already
 * established for this codebase's own looped reads.
 * @param {object} filters same shape as listSalesRegisterRows, minus limit/offset
 * @returns {Promise<object[]>}
 */
export async function listAllSalesRegisterRows (filters = {}) {
  const rows = [];
  let offset = 0;
  for (;;) {
    const { rows: page } = await listSalesRegisterRows({ ...filters, limit: PAGE_SIZE_MAX, offset });
    rows.push(...page);
    if (page.length < PAGE_SIZE_MAX) break;
    offset += PAGE_SIZE_MAX;
  }
  return rows;
}

/**
 * The full customer list for the Sales Register's own Customer filter
 * <select> -- a different real need than sales.js's own searchParties()
 * (a live-typeahead lookup, default limit 20, no fixed order): the same
 * "search vs list" distinction suppliers.js already draws between
 * searchSuppliers() and listSuppliers().
 * @returns {Promise<{value: string, label: string}[]>}
 */
export async function listSalesRegisterCustomerOptions () {
  const co = getActiveCompanyId();
  const { data, error } = await supa.from('parties')
    .select('id, name')
    .eq('company_id', co).eq('is_customer', true)
    .order('name', { ascending: true });
  if (error) throw error;
  return (data || []).map((p) => ({ value: p.id, label: p.name }));
}
