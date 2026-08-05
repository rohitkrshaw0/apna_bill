// =====================================================================
// trialBalanceData.js
// Read-only data-access layer for the Trial Balance Platform (Milestone
// 15F) -- the ONLY place trial-balance.html touches Supabase. Every
// balance figure comes from js/ledgerData.js's balanceAt(), reused
// verbatim -- this file computes no balance itself, client-side or
// otherwise, the same "zero duplicated accounting logic" rule 15E's own
// v_journal_ledger_lines (ADR-0012) established.
//
// ---------------------------------------------------------------------
// WHY THIS IS A BOUNDED FAN-OUT (Promise.all over balanceAt()), NOT ONE
// QUERY -- see ADR-0013 for the full proof
// ---------------------------------------------------------------------
// A Trial Balance needs "every account's balance as of a selectable
// date," including an arbitrary PAST date, in one screen. A single
// PostgREST query cannot compute that correctly: any single-query
// technique that first PICKS one row per account (DISTINCT ON, a
// ROW_NUMBER window ranked to 1, a GROUP BY MAX(entry_date) joined back,
// or a LATERAL "latest row" join) is subject to the same bug -- the pick
// happens before a client-supplied `.lte('entry_date', asOfDate)` filter
// can apply, so an account with activity both before and after the
// cutoff either shows today's balance (wrong) or vanishes (also wrong),
// instead of showing its balance as of the cutoff. The single-query
// version that IS correct (`SELECT DISTINCT ON (account_id) ... WHERE
// entry_date <= $2 ORDER BY account_id, entry_date DESC, ...`, with the
// date bound textually inside the same SELECT, ahead of the pick)
// requires a parameterized stored function -- an RPC, which this
// milestone's own architecture review (ADR-0013) found no
// SECURITY-INVOKER-safe, non-schema-changing way to introduce here.
//
// balanceAt() itself is NOT subject to this bug (see its own doc
// comment in ledgerData.js): v_journal_ledger_lines.running_balance is a
// PREFIX SUM, not a row-pick, so "filter to entry_date <= X, then take
// the latest survivor" is exactly correct per account. This file simply
// calls that already-correct, already-existing function once per
// account, in parallel. N = chart-of-accounts size (typically tens for
// an SMB, not transaction volume) -- the same bounded, parallelizable
// fan-out shape journalRegisterData.js's own linked-entry lookup already
// uses, not the N+1-over-transactions anti-pattern this codebase has
// previously rejected. See ADR-0013 for the explicit performance
// threshold at which a dedicated RPC would become worth reconsidering.
// =====================================================================

import { supa, getActiveCompanyId } from './supabaseClient.js';
import { balanceAt, bucketSignedBalance } from './ledgerData.js';

/**
 * Pure: turns already-fetched accounts + already-fetched balances (same
 * order, same length) into Trial Balance rows and grand totals. No
 * Supabase, no I/O, no balance computation of its own -- bucketing reuses
 * bucketSignedBalance() (ledgerData.js), and the grand totals are a plain
 * reduce over already-correct per-account figures, the same category of
 * operation journalRegisterData.js's own sumLines() already performs on
 * already-fetched debit/credit values. Exported specifically so it can be
 * unit-tested with zero network dependency.
 * @param {object[]} accounts each with id/code/name/category/type/normal_balance
 * @param {number[]} balances balances[i] is accounts[i]'s signed running balance
 * @param {{includeZeroBalances?: boolean}} [opts]
 * @returns {{rows: object[], totals: {debit: number, credit: number}}}
 */
export function buildTrialBalanceRows (accounts, balances, { includeZeroBalances = true } = {}) {
  let rows = accounts.map((account, i) => {
    const { side, amount } = bucketSignedBalance(balances[i], account.normal_balance);
    return { ...account, balance: balances[i], side, amount };
  });

  if (!includeZeroBalances) rows = rows.filter((r) => r.amount !== 0);

  const totals = rows.reduce((acc, r) => {
    if (r.side === 'debit') acc.debit += r.amount; else acc.credit += r.amount;
    return acc;
  }, { debit: 0, credit: 0 });

  return { rows, totals };
}

/**
 * The full Trial Balance as of `asOfDate` (or the account's current
 * balance when `asOfDate` is null): every account in the company's chart
 * of accounts (every status -- an inactive account with a historical
 * balance still belongs in a formal trial balance, unlike
 * searchAccounts()'s picker-scoped `status: 'active'` filter), each
 * bucketed into a Debit or Credit figure, plus grand totals. These
 * totals are always expected to tie out (debit === credit) as a direct
 * consequence of every posted entry already being balanced
 * (post_journal_entry()'s own DB-side assertion) -- not re-validated
 * here, since re-checking it would be exactly the duplicated accounting
 * logic this file exists to avoid.
 * @param {{asOfDate?: string|null, includeZeroBalances?: boolean}} [opts]
 * @returns {Promise<{rows: object[], totals: {debit: number, credit: number}}>}
 */
export async function getTrialBalance ({ asOfDate = null, includeZeroBalances = true } = {}) {
  const co = getActiveCompanyId();

  const { data: accounts, error } = await supa.from('accounts')
    .select('id, code, name, category, type, normal_balance, status')
    .eq('company_id', co)
    .order('code', { ascending: true });
  if (error) throw error;

  const balances = await Promise.all(
    (accounts || []).map((a) => balanceAt(co, a.id, { throughInclusive: asOfDate }))
  );

  return buildTrialBalanceRows(accounts || [], balances, { includeZeroBalances });
}
