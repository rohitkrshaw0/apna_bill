// =====================================================================
// manualJournal.js
// Data layer for journal.html (Milestone 15C — Manual Journal Engine).
// Mirrors js/sales.js's own split: this module owns reads (account
// search, a soft duplicate-reference lookup) and the one write path
// (AccountingPlatform.post()) -- it never imports a posting provider,
// registry, or the account resolver directly, and never inserts into
// journal_entries/journal_lines/accounts itself. journal.html imports
// and calls registerManualJournalPostingProvider() itself, the same
// place sale.html/purchase.html/manufacturing.html each register their
// own posting provider -- not this data-layer module.
// =====================================================================

import { supa, getActiveCompanyId } from './supabaseClient.js';
import { createSearchService } from './searchService.js';
import { AccountingPlatform, VOUCHER_TYPES } from './services/accounting/index.js';

// ---------- Chart of Accounts (read-only) ------------------------------
// RLS on `accounts` is select-only for company members (see schema.sql's
// "Accounting Platform RLS" section) -- reading it directly here for a
// picker is not a write, and is the same pattern js/sales.js's own
// itemSearch already uses against `items`.
const accountSearch = createSearchService({
  table: 'accounts',
  select: 'id, code, name, category, type, normal_balance',
  searchColumns: ['name', 'code'],
  scope: { status: 'active' }
});
export function searchAccounts (q, { limit } = {}) {
  return accountSearch(q, { limit });
}

// ---------- Duplicate reference (advisory only) -------------------------
// There is no unique constraint on journal_entries.reference for manual
// journals (only ref_table/ref_id are idempotency-checked, and both are
// always null here -- see the Milestone 15C audit). This is a soft,
// non-blocking lookup so journal.html can warn before posting, not a
// validation rule -- two genuinely separate manual entries may legitimately
// share the same reference text (e.g. the same external voucher number
// corrected in two parts).
export async function findJournalsByReference (reference) {
  if (!reference) return [];
  const co = getActiveCompanyId();
  const { data, error } = await supa
    .from('journal_entries')
    .select('journal_no, entry_date')
    .eq('company_id', co)
    .eq('reference', reference)
    .limit(5);
  if (error) throw error;
  return data || [];
}

// ---------- Posting -----------------------------------------------------
/**
 * @param {object} entry
 * @param {string} entry.date 'YYYY-MM-DD'
 * @param {string|null} entry.reference
 * @param {string|null} entry.narration
 * @param {Array<{accountId: string, debit: number, credit: number, narration: string|null}>} entry.lines
 */
export function postManualJournal ({ date, reference, narration, lines }) {
  const co = getActiveCompanyId();
  return AccountingPlatform.post({
    companyId: co,
    voucherType: VOUCHER_TYPES.JOURNAL,
    sourceData: { date, reference, narration, lines },
    // No source document -- this is exactly the manual-entry case
    // schema.sql's own ref_table/ref_id comment names as the reason those
    // columns are nullable.
    ref: null,
    createdBy: null
  });
}
