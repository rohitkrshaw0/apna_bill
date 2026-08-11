// =====================================================================
// ledgerData.js
// Read-only data-access layer for the General Ledger Platform
// (Milestone 15E) -- the ONLY place ledger.html touches Supabase. Every
// read goes through v_journal_ledger_lines (schema.sql, ADR-0012), the
// canonical per-account running-balance projection -- this file never
// computes a balance itself, client-side or otherwise. Follows the same
// shape journalRegisterData.js (15D) already established: flat,
// top-level, sibling to journal.js/journalRegisterData.js, not nested
// inside js/services/reporting/, not registered as a Report.
//
// Read-only: never writes to journal_entries/journal_lines/accounts, and
// never writes to v_journal_ledger_lines (it's a view -- there is nothing
// to write to). RLS on the three base tables (je_select/jl_select/
// accounts_select, unchanged since 15B) scopes every query to the active
// company automatically -- re-evaluated for the actual querying user on
// every read because the view is declared `security_invoker = true`
// (schema.sql §29, ADR-0012); without that clause this inheritance is
// NOT automatic (live-verified during this milestone's own validation).
//
// ---------------------------------------------------------------------
// WHY OPENING/CLOSING BALANCE IGNORE THE ROW-DISPLAY FILTERS
// ---------------------------------------------------------------------
// voucherType / postingSource / search narrow which LINES are shown --
// they are display filters, not "pretend these transactions didn't
// happen" toggles. Opening and closing balance are true, account-wide
// facts as of the edges of the selected DATE window, so they are computed
// against the account's complete line history (only account + date
// bounds applied), never against the row-display filters. Concretely: if
// a user filters the visible rows to "Sales" vouchers only, each visible
// row's own `running_balance` (a column already computed by the view,
// unconditionally, over every line) still reflects the true balance
// including non-Sales lines that came before it -- and the opening/
// closing balance shown above/below the list must agree with that, not
// with a balance computed over only the visible subset.
// =====================================================================

import { supa, getActiveCompanyId } from './supabaseClient.js';

export const LEDGER_SORT = Object.freeze({
  DATE_ASC: 'dateAsc',
  DATE_DESC: 'dateDesc'
});

const ROW_SELECT = 'id, journal_entry_id, line_no, debit, credit, line_narration, ' +
  'journal_no, fy_label, entry_date, voucher_type, posting_source, reference, ' +
  'entry_narration, reverses_journal_id, reversed_by_journal_id, created_by, created_at, ' +
  'normal_balance, running_balance';

function applyDisplayFilters (query, { dateFrom, dateTo, voucherType, postingSource, search } = {}) {
  if (dateFrom) query = query.gte('entry_date', dateFrom);
  if (dateTo) query = query.lte('entry_date', dateTo);
  if (voucherType) query = query.eq('voucher_type', voucherType);
  if (postingSource) query = query.eq('posting_source', postingSource);

  const term = (search || '').trim();
  if (term) query = query.or(`journal_no.ilike.%${term}%,reference.ilike.%${term}%,entry_narration.ilike.%${term}%,line_narration.ilike.%${term}%`);

  return query;
}

function applySort (query, sort) {
  const ascending = sort !== LEDGER_SORT.DATE_DESC;
  return query.order('entry_date', { ascending }).order('journal_no', { ascending }).order('line_no', { ascending });
}

/**
 * The true running balance as of just before `beforeDate`, or as of the
 * account's latest line when `beforeDate` is null -- the account's
 * complete history, account + date-bound only, never the row-display
 * filters (see file header). Returns 0 when there is no such line
 * (nothing posted yet, or nothing before the opening edge).
 *
 * This is correct for an arbitrary historical `throughInclusive` date for
 * a reason worth stating explicitly, since it is the exact property
 * Milestone 15F's Trial Balance depends on: `running_balance` is a
 * PREFIX SUM (`SUM() OVER (... ROWS BETWEEN UNBOUNDED PRECEDING AND
 * CURRENT ROW)`), not a collapse-to-one-row pick. Every row's own
 * running_balance is baked in by the view as a function of everything at
 * or before it; filtering OUT later rows via `.lte('entry_date', X)` can
 * never change an earlier surviving row's own prefix sum. So "filter to
 * entry_date <= X, then take the latest survivor" is exactly correct --
 * that survivor's own running_balance already IS the balance as of X.
 * (Contrast: a DISTINCT ON/window-rank/GROUP BY MAX query that PICKS a
 * row first and is filtered afterward is NOT safe for an arbitrary past
 * date -- see ADR-0013 for the full proof; this function's shape is
 * exactly why it avoids that bug.)
 * @param {string} companyId
 * @param {string} accountId
 * @param {{before?: string|null, throughInclusive?: string|null}} bound
 * @returns {Promise<number>}
 */
export async function balanceAt (companyId, accountId, { before = null, throughInclusive = null } = {}) {
  let query = supa.from('v_journal_ledger_lines')
    .select('running_balance')
    .eq('company_id', companyId)
    .eq('account_id', accountId);
  if (before) query = query.lt('entry_date', before);
  if (throughInclusive) query = query.lte('entry_date', throughInclusive);
  query = query.order('entry_date', { ascending: false }).order('journal_no', { ascending: false }).order('line_no', { ascending: false }).limit(1);

  const { data, error } = await query;
  if (error) throw error;
  return data && data.length > 0 ? +data[0].running_balance || 0 : 0;
}

/**
 * A dated, filtered, sorted, server-paginated General Ledger page for one
 * account: rows (each already carrying its own true running_balance from
 * the view), the opening balance as of the day before `dateFrom` (0 if
 * `dateFrom` is not set), the closing balance as of `dateTo` (or the
 * account's latest line if `dateTo` is not set), and the total row count
 * for the current filters.
 * @param {object} opts
 * @param {string} opts.accountId required -- the Ledger shows one account at a time
 * @param {string|null} [opts.dateFrom] "YYYY-MM-DD", inclusive
 * @param {string|null} [opts.dateTo] "YYYY-MM-DD", inclusive
 * @param {string} [opts.voucherType]
 * @param {string} [opts.postingSource]
 * @param {string} [opts.search] matched against journal_no / reference / narration
 * @param {string} [opts.sort] one of LEDGER_SORT
 * @param {number} [opts.limit]
 * @param {number} [opts.offset]
 * @returns {Promise<{rows: object[], count: number, openingBalance: number, closingBalance: number}>}
 */
/**
 * Presentation-only, pure: which side (`'debit'`|`'credit'`) a signed
 * balance actually reads as, and its absolute magnitude. A negative
 * `balance` means the account has swung to the opposite side of its own
 * `normalBalance` (e.g. an overdrawn bank account) -- shown as the other
 * side's label, never a minus sign. The balance value itself is never
 * recomputed here; this only decides how an already-correct number is
 * displayed. Shared by ledger.html and js/trialBalanceData.js so neither
 * duplicates this logic (Milestone 15F reuse requirement).
 * @param {number} balance
 * @param {'debit'|'credit'} normalBalance
 * @returns {{side: 'debit'|'credit', amount: number}}
 */
export function bucketSignedBalance (balance, normalBalance) {
  const n = +balance || 0;
  const side = n >= 0 ? normalBalance : (normalBalance === 'debit' ? 'credit' : 'debit');
  return { side, amount: Math.abs(n) };
}

/**
 * One account, by id, scoped to the active company -- the same
 * id/code/name/category/normal_balance shape searchAccounts()
 * (js/manualJournal.js) already returns, so ledger.html's account-header
 * rendering works identically whichever path selected the account.
 * Exists so ledger.html can honor an optional `?account=<id>` URL
 * contract (drill-down from trial-balance.html, mirroring
 * journal-detail.html's own `?id=` contract) without ever querying
 * Supabase directly itself. Returns null for a missing, malformed, or
 * RLS-inaccessible id -- same "not found and not yours read the same"
 * posture getJournalDetail() already established.
 * @param {string} accountId
 * @returns {Promise<object|null>}
 */
export async function getAccountById (accountId) {
  if (!accountId) return null;
  const co = getActiveCompanyId();
  const { data, error } = await supa.from('accounts')
    .select('id, code, name, category, type, normal_balance')
    .eq('company_id', co)
    .eq('id', accountId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function getLedgerPage ({
  accountId, dateFrom = null, dateTo = null, voucherType = '', postingSource = '', search = '',
  sort = LEDGER_SORT.DATE_ASC, limit = 50, offset = 0
} = {}) {
  if (!accountId) return { rows: [], count: 0, openingBalance: 0, closingBalance: 0 };
  const co = getActiveCompanyId();

  let query = supa.from('v_journal_ledger_lines').select(ROW_SELECT, { count: 'exact' })
    .eq('company_id', co).eq('account_id', accountId);
  query = applyDisplayFilters(query, { dateFrom, dateTo, voucherType, postingSource, search });
  query = applySort(query, sort);
  query = query.range(offset, offset + limit - 1);

  // Opening balance is 0, not "the account's latest balance," when there is no
  // `dateFrom` bound -- balanceAt()'s `before` filter is simply omitted for a
  // null bound (see its own doc comment), which would otherwise silently
  // collapse to the same query as the closing-balance lookup below. An
  // unbounded ledger's opening edge is the account's inception, not its
  // present. Live-validation caught this returning the closing balance twice
  // before this guard was added.
  const [{ data, error, count }, openingBalance, closingBalance] = await Promise.all([
    query,
    dateFrom ? balanceAt(co, accountId, { before: dateFrom }) : Promise.resolve(0),
    balanceAt(co, accountId, { throughInclusive: dateTo })
  ]);
  if (error) throw error;

  return { rows: data || [], count: count || 0, openingBalance, closingBalance };
}
