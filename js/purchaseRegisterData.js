// =====================================================================
// purchaseRegisterData.js
// Reporting Data Access layer for the Purchase Register (Milestone
// 14B.3), per ADR-0004 (Reporting Data Access Strategy) and ADR-0005
// (Operational Report Data Provider Pattern). One provider, one report,
// flat and top-level, sibling to purchases.js/suppliers.js -- never
// nested inside js/services/reporting/, per ADR-0005's own rule.
//
// Read-only. No Business Intelligence. No business rules -- see this
// file's own functions for exactly what "bucketing an existing stored
// number into a label" means here, the same limited scope ADR-0005 §3
// draws.
//
// Schema note: unlike invoices, `purchases` snapshots only the
// supplier's GSTIN/state code (supplier_gstin_snapshot/
// supplier_state_code_snapshot), never a name or phone. Supplier
// name/phone is read via the standard PostgREST embed
// `parties(name, phone)` over the existing supplier_id foreign key --
// the same embedding style dataExchange/xml/export/dataReaders.js
// already uses (`invoice_lines.select('*, batches(batch_no)')`), for
// DISPLAY only. Search/sort here deliberately stay on purchases' own
// base-table columns (bill_no, bill_date, grand_total, amount_due) --
// filtering or ordering by an embedded relation's column is a real
// PostgREST/supabase-js capability, but nothing in this codebase uses it
// yet and it cannot be verified against a live database in this
// environment, so it is not introduced here. See
// docs/reports/milestone-14B-completion.md for this disclosed,
// schema-driven asymmetry with the Sales Register (which searches/sorts
// by customer name because invoices *do* snapshot it).
// =====================================================================

import { supa, getActiveCompanyId } from './supabaseClient.js';

export const PURCHASE_REGISTER_SORT = Object.freeze({
  DATE_DESC: 'dateDesc',
  DATE_ASC: 'dateAsc',
  BILL_NO: 'billNo',
  AMOUNT_DESC: 'amountDesc',
  AMOUNT_DUE_DESC: 'amountDueDesc'
});

// Derived from purchases.amount_paid/amount_due -- both already-stored
// totals the create_purchase RPC writes once (purchases.js's own
// savePurchaseFromCart); this only buckets an existing number into a
// label, the same non-calculation ADR-0005 §3 sanctions. Purchases has no
// doc_type column (no Sale/Sale Return/Quotation-like dimension exists
// for a purchase bill), so unlike the Sales Register there is no
// analogous "Status" filter here -- disclosed, not an oversight.
export const PURCHASE_REGISTER_PAYMENT_STATUS = Object.freeze({
  PAID: 'paid',
  PARTIAL: 'partial',
  UNPAID: 'unpaid'
});

export const PURCHASE_REGISTER_PAYMENT_STATUS_OPTIONS = Object.freeze([
  { value: PURCHASE_REGISTER_PAYMENT_STATUS.PAID, label: 'Paid' },
  { value: PURCHASE_REGISTER_PAYMENT_STATUS.PARTIAL, label: 'Partial' },
  { value: PURCHASE_REGISTER_PAYMENT_STATUS.UNPAID, label: 'Unpaid' }
]);

const SELECT = 'id, bill_no, bill_date, supplier_id, grand_total, amount_paid, amount_due, parties(name, phone)';

// Same looped-read page size dataExchange/xml/export/dataReaders.js (and
// salesRegisterData.js) already use for "genuinely new unpaginated/looped
// reads" -- reused, not reinvented.
const PAGE_SIZE_MAX = 500;

function applyFilters (query, { dateFrom, dateTo, supplierId, search, paymentStatus } = {}) {
  if (dateFrom) query = query.gte('bill_date', dateFrom);
  if (dateTo) query = query.lte('bill_date', dateTo);
  if (supplierId) query = query.eq('supplier_id', supplierId);

  if (paymentStatus === PURCHASE_REGISTER_PAYMENT_STATUS.PAID) query = query.lte('amount_due', 0);
  else if (paymentStatus === PURCHASE_REGISTER_PAYMENT_STATUS.UNPAID) query = query.eq('amount_paid', 0).gt('amount_due', 0);
  else if (paymentStatus === PURCHASE_REGISTER_PAYMENT_STATUS.PARTIAL) query = query.gt('amount_paid', 0).gt('amount_due', 0);

  const term = (search || '').trim();
  if (term) query = query.ilike('bill_no', `%${term}%`);

  return query;
}

function applySort (query, sort) {
  switch (sort) {
    case PURCHASE_REGISTER_SORT.DATE_ASC: return query.order('bill_date', { ascending: true }).order('created_at', { ascending: true });
    case PURCHASE_REGISTER_SORT.BILL_NO: return query.order('bill_no', { ascending: true });
    case PURCHASE_REGISTER_SORT.AMOUNT_DESC: return query.order('grand_total', { ascending: false });
    case PURCHASE_REGISTER_SORT.AMOUNT_DUE_DESC: return query.order('amount_due', { ascending: false });
    default: return query.order('bill_date', { ascending: false }).order('created_at', { ascending: false });
  }
}

/**
 * A dated, filtered, paginated, sortable listing of purchase bills -- the
 * Purchase Register's own real row-level need (ADR-0004 path 2).
 * Company-scoped and RLS-bound exactly like every other js/*.js read.
 * @param {object} opts
 * @param {string|null} [opts.dateFrom] "YYYY-MM-DD", inclusive
 * @param {string|null} [opts.dateTo] "YYYY-MM-DD", inclusive
 * @param {string} [opts.supplierId]
 * @param {string} [opts.search] matched against bill_no
 * @param {string} [opts.paymentStatus] one of PURCHASE_REGISTER_PAYMENT_STATUS
 * @param {string} [opts.sort] one of PURCHASE_REGISTER_SORT
 * @param {number} [opts.limit]
 * @param {number} [opts.offset]
 * @returns {Promise<{rows: object[], count: number}>}
 */
export async function listPurchaseRegisterRows ({
  dateFrom = null, dateTo = null, supplierId = '', search = '', paymentStatus = '',
  sort = PURCHASE_REGISTER_SORT.DATE_DESC, limit = 40, offset = 0
} = {}) {
  const co = getActiveCompanyId();
  let query = supa.from('purchases').select(SELECT, { count: 'exact' }).eq('company_id', co);
  query = applyFilters(query, { dateFrom, dateTo, supplierId, search, paymentStatus });
  query = applySort(query, sort);
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data || [], count: count || 0 };
}

/**
 * Every row matching the current filters, ignoring pagination -- backs
 * the Purchase Register's own CSV export (the current FILTERED view, not
 * just the page currently loaded on screen). Loops in PAGE_SIZE_MAX
 * batches, the same fetchAllPages convention this codebase already uses
 * (dataReaders.js, salesRegisterData.js).
 * @param {object} filters same shape as listPurchaseRegisterRows, minus limit/offset
 * @returns {Promise<object[]>}
 */
export async function listAllPurchaseRegisterRows (filters = {}) {
  const rows = [];
  let offset = 0;
  for (;;) {
    const { rows: page } = await listPurchaseRegisterRows({ ...filters, limit: PAGE_SIZE_MAX, offset });
    rows.push(...page);
    if (page.length < PAGE_SIZE_MAX) break;
    offset += PAGE_SIZE_MAX;
  }
  return rows;
}
