// =====================================================================
// journalRegisterData.js
// Read-only data-access layer for the Journal Inquiry Platform
// (Milestone 15D) -- the ONLY place journal-register.html and
// journal-detail.html touch Supabase. Neither screen queries directly;
// every read goes through one of the two functions this file exports.
// Follows the same conventions ADR-0004 (Reporting Data Access
// Strategy) / ADR-0005 (Operational Report Data Provider Pattern)
// already established for salesRegisterData.js/purchaseRegisterData.js/
// stockRegisterData.js: flat, top-level, sibling to sales.js/
// purchases.js/manufacturing.js/manualJournal.js -- not nested inside
// js/services/reporting/, and not registered as a Report (this
// milestone's own brief: "DOES NOT create financial reports" -- see
// journal-register.html's header comment for why it isn't built on the
// Reporting Platform's shell).
//
// Read-only: never writes to journal_entries/journal_lines/accounts.
// RLS (je_select/jl_select/accounts_select, unchanged since 15B) scopes
// every query to the active company automatically -- nothing here
// re-implements that.
//
// ---------------------------------------------------------------------
// WHY THE ACCOUNT FILTER IS A SEPARATE LOOKUP, NOT AN EMBEDDED !inner
// ---------------------------------------------------------------------
// journal_lines(debit, credit) is embedded on every header row so the
// register can show each entry's own totals without a second query per
// row (no N+1). But PostgREST narrows an embedded resource to only the
// rows a filter on it matches -- `journal_lines!inner(...).eq(
// 'journal_lines.account_id', x)` would return ONLY the matching lines,
// silently turning "total debit/credit for this entry" into "total for
// just the filtered line." Resolving matching journal_entry_ids first,
// then filtering journal_entries by `id.in.(...)`, keeps the totals
// embed intact and correct. Two queries total when this filter is
// active, never one per row.
// =====================================================================

import { supa, getActiveCompanyId } from './supabaseClient.js';

export const JOURNAL_REGISTER_SORT = Object.freeze({
  DATE_DESC: 'dateDesc',
  DATE_ASC: 'dateAsc',
  JOURNAL_NO_ASC: 'journalNoAsc',
  JOURNAL_NO_DESC: 'journalNoDesc'
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const HEADER_SELECT = 'id, journal_no, fy_label, entry_date, voucher_type, posting_source, ' +
  'reference, narration, ref_table, ref_id, reverses_journal_id, reversed_by_journal_id, ' +
  'created_by, created_at, journal_lines(debit, credit)';

const DETAIL_SELECT = 'id, company_id, journal_no, fy_label, entry_date, voucher_type, posting_source, ' +
  'reference, narration, ref_table, ref_id, reverses_journal_id, reversed_by_journal_id, ' +
  'created_by, created_at, ' +
  'journal_lines(id, line_no, debit, credit, narration, account_id, accounts(id, code, name))';

function applyFilters (query, { dateFrom, dateTo, voucherType, postingSource, search } = {}) {
  if (dateFrom) query = query.gte('entry_date', dateFrom);
  if (dateTo) query = query.lte('entry_date', dateTo);
  if (voucherType) query = query.eq('voucher_type', voucherType);
  if (postingSource) query = query.eq('posting_source', postingSource);

  const term = (search || '').trim();
  if (term) query = query.or(`journal_no.ilike.%${term}%,reference.ilike.%${term}%,narration.ilike.%${term}%`);

  return query;
}

function applySort (query, sort) {
  switch (sort) {
    case JOURNAL_REGISTER_SORT.DATE_ASC: return query.order('entry_date', { ascending: true }).order('journal_no', { ascending: true });
    case JOURNAL_REGISTER_SORT.JOURNAL_NO_ASC: return query.order('journal_no', { ascending: true });
    case JOURNAL_REGISTER_SORT.JOURNAL_NO_DESC: return query.order('journal_no', { ascending: false });
    default: return query.order('entry_date', { ascending: false }).order('journal_no', { ascending: false });
  }
}

function sumLines (lines) {
  let debit = 0;
  let credit = 0;
  for (const l of lines || []) { debit += +l.debit || 0; credit += +l.credit || 0; }
  return { totalDebit: debit, totalCredit: credit };
}

function mapHeaderRow (row) {
  const { journal_lines: lines, ...header } = row;
  return { ...header, ...sumLines(lines) };
}

/**
 * Resolves which journal_entry ids have at least one line against
 * `accountId`, scoped to the company. Empty array means "no entry
 * matches" -- the caller short-circuits rather than issuing a query
 * that would trivially return nothing.
 * @returns {Promise<string[]>}
 */
async function resolveAccountFilterEntryIds (companyId, accountId) {
  const { data, error } = await supa.from('journal_lines')
    .select('journal_entry_id')
    .eq('company_id', companyId)
    .eq('account_id', accountId);
  if (error) throw error;
  return [...new Set((data || []).map((r) => r.journal_entry_id))];
}

/**
 * A dated, filtered, sorted, server-paginated listing of journal
 * entries with their own debit/credit totals -- the Journal Register's
 * real row-level need. Every filter/sort is applied before the
 * `.range()` call; there is no client-side "load everything then
 * filter/sort/paginate in memory" path.
 * @param {object} opts
 * @param {string|null} [opts.dateFrom] "YYYY-MM-DD", inclusive
 * @param {string|null} [opts.dateTo] "YYYY-MM-DD", inclusive
 * @param {string} [opts.voucherType] a VOUCHER_TYPES value
 * @param {string} [opts.postingSource] a POSTING_SOURCES value
 * @param {string} [opts.accountId]
 * @param {string} [opts.search] matched against journal_no / reference / narration
 * @param {string} [opts.sort] one of JOURNAL_REGISTER_SORT
 * @param {number} [opts.limit]
 * @param {number} [opts.offset]
 * @returns {Promise<{rows: object[], count: number}>}
 */
export async function listJournalRegisterRows ({
  dateFrom = null, dateTo = null, voucherType = '', postingSource = '', accountId = '', search = '',
  sort = JOURNAL_REGISTER_SORT.DATE_DESC, limit = 40, offset = 0
} = {}) {
  const co = getActiveCompanyId();

  let entryIds = null;
  if (accountId) {
    entryIds = await resolveAccountFilterEntryIds(co, accountId);
    if (entryIds.length === 0) return { rows: [], count: 0 };
  }

  let query = supa.from('journal_entries').select(HEADER_SELECT, { count: 'exact' }).eq('company_id', co);
  if (entryIds) query = query.in('id', entryIds);
  query = applyFilters(query, { dateFrom, dateTo, voucherType, postingSource, search });
  query = applySort(query, sort);
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: (data || []).map(mapHeaderRow), count: count || 0 };
}

/**
 * Exactly one journal entry by id, with every line and each line's
 * account name/code -- a single query (plus, only when this entry is
 * part of a reversal pair, one small follow-up query for the linked
 * entry's own journal_no, purely for display -- never one query per
 * line). Returns null for a missing, malformed, or RLS-inaccessible id
 * -- indistinguishable by design, since "not found" and "not yours" must
 * read the same to the caller (RLS itself already makes that
 * distinction invisible at the query level).
 * @param {string} journalEntryId
 * @returns {Promise<object|null>}
 */
export async function getJournalDetail (journalEntryId) {
  if (!journalEntryId || !UUID_RE.test(journalEntryId)) return null;
  const co = getActiveCompanyId();

  const { data, error } = await supa.from('journal_entries')
    .select(DETAIL_SELECT)
    .eq('company_id', co)
    .eq('id', journalEntryId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  let reversesJournalNo = null;
  let reversedByJournalNo = null;
  const linkedIds = [data.reverses_journal_id, data.reversed_by_journal_id].filter(Boolean);
  if (linkedIds.length > 0) {
    const { data: linked, error: linkedError } = await supa.from('journal_entries')
      .select('id, journal_no')
      .eq('company_id', co)
      .in('id', linkedIds);
    if (!linkedError && linked) {
      reversesJournalNo = linked.find((l) => l.id === data.reverses_journal_id)?.journal_no || null;
      reversedByJournalNo = linked.find((l) => l.id === data.reversed_by_journal_id)?.journal_no || null;
    }
  }

  const lines = [...(data.journal_lines || [])].sort((a, b) => a.line_no - b.line_no);
  return { ...data, journal_lines: lines, reversesJournalNo, reversedByJournalNo };
}
