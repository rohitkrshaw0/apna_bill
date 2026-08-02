// =====================================================================
// customerOutstandingData.js
// Reporting Data Access layer for Outstanding Summary (Milestone 14B.5),
// per ADR-0004 (Reporting Data Access Strategy) and ADR-0005 (Operational
// Report Data Provider Pattern). One provider, one report/domain, flat
// and top-level, sibling to suppliers.js/salesRegisterData.js -- never
// nested inside js/services/reporting/.
//
// Schema validation performed before writing this file (see
// docs/reports/milestone-14B5-outstanding-completion.md §0):
// parties.current_balance is the authoritative, RPC-maintained running
// balance for customers -- sale_rpc.sql's own create_sale updates it
// atomically, row-locked, in the SAME transaction as invoice creation:
// `current_balance = current_balance + (grand_total - amount_paid)`. A
// search of every .sql file in this repository for "current_balance"
// returns exactly three hits: the column definition and this one update
// (plus its mirrored supplier-side counterpart) -- no other place this
// figure is stored or computed. There is no separate later-payment-
// recording RPC anywhere in this schema that could let it drift out of
// sync with invoices (every `insert into payments` site is inside
// create_sale/create_purchase themselves, or restore_rpc.sql's backup
// path). This provider reads the column directly. It does NOT sum
// invoices, does NOT replay stock_ledger-style transaction history, and
// does NOT duplicate any calculation create_sale's own RPC already
// performs.
//
// No existing public function already exposes this for customers:
// suppliers.js's own listSuppliers() is the closest precedent (same
// table, same current_balance column, already supports sort:'balance')
// but is scoped and tested for the Supplier Management screen
// (is_supplier=true) -- not directly reusable without blurring its own
// name/scope, the same "structurally similar, still gets its own named
// function" precedent Sales/Purchase/Stock Register already set for
// each other.
// =====================================================================

import { supa, getActiveCompanyId } from './supabaseClient.js';

export const CUSTOMER_OUTSTANDING_SORT = Object.freeze({
  BALANCE_DESC: 'balanceDesc',
  NAME_ASC: 'nameAsc'
});

const SELECT = 'id, name, phone, email, current_balance, is_active';

// Same looped-read page size every other reporting provider in this
// codebase already uses for CSV export.
const PAGE_SIZE_MAX = 500;

function applyFilters (query, { search, balanceStatus } = {}) {
  const term = (search || '').trim();
  if (term) query = query.or(`name.ilike.%${term}%,phone.ilike.%${term}%`);

  // Presentation-level bucketing of the one already-stored figure
  // (current_balance), the same precedent Payment Status/Stock Status
  // already set -- never a new calculation.
  if (balanceStatus === 'outstanding') query = query.gt('current_balance', 0);
  else if (balanceStatus === 'credit') query = query.lt('current_balance', 0);
  else if (balanceStatus === 'settled') query = query.eq('current_balance', 0);

  return query;
}

function applySort (query, sort) {
  return sort === CUSTOMER_OUTSTANDING_SORT.NAME_ASC
    ? query.order('name', { ascending: true })
    : query.order('current_balance', { ascending: false }); // biggest debtors first
}

/**
 * Every customer's current outstanding balance -- read directly from
 * parties.current_balance, never computed here. Company-scoped and
 * RLS-bound exactly like every other js/*.js read.
 * @param {object} opts
 * @param {string} [opts.search] matched against name/phone
 * @param {string} [opts.balanceStatus] 'outstanding' | 'credit' | 'settled'
 * @param {boolean} [opts.activeOnly]
 * @param {string} [opts.sort] one of CUSTOMER_OUTSTANDING_SORT
 * @param {number} [opts.limit]
 * @param {number} [opts.offset]
 * @returns {Promise<{rows: object[], count: number}>}
 */
export async function listCustomerOutstandingBalances ({
  search = '', balanceStatus = '', activeOnly = true,
  sort = CUSTOMER_OUTSTANDING_SORT.BALANCE_DESC, limit = 40, offset = 0
} = {}) {
  const co = getActiveCompanyId();
  let query = supa.from('parties').select(SELECT, { count: 'exact' }).eq('company_id', co).eq('is_customer', true);
  if (activeOnly) query = query.eq('is_active', true);
  query = applyFilters(query, { search, balanceStatus });
  query = applySort(query, sort);
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data || [], count: count || 0 };
}

/**
 * Every customer matching the current filters, ignoring pagination --
 * backs the Outstanding Summary's own CSV export. Loops in PAGE_SIZE_MAX
 * batches, the same fetchAllPages convention this codebase already uses.
 * @param {object} filters same shape as listCustomerOutstandingBalances, minus limit/offset
 * @returns {Promise<object[]>}
 */
export async function listAllCustomerOutstandingBalances (filters = {}) {
  const rows = [];
  let offset = 0;
  for (;;) {
    const { rows: page } = await listCustomerOutstandingBalances({ ...filters, limit: PAGE_SIZE_MAX, offset });
    rows.push(...page);
    if (page.length < PAGE_SIZE_MAX) break;
    offset += PAGE_SIZE_MAX;
  }
  return rows;
}
