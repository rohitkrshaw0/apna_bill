// =====================================================================
// profitLossData.js
// Read-only data-access layer for the Profit & Loss Platform (Milestone
// 15G) -- the ONLY place profit-loss.html touches Supabase. Every figure
// comes from js/ledgerData.js's balanceAt(), reused verbatim -- this file
// computes no balance itself, client-side or otherwise, the same "zero
// duplicated accounting logic" rule 15E's own v_journal_ledger_lines
// (ADR-0012) established and 15F's trialBalanceData.js already followed.
//
// ---------------------------------------------------------------------
// WHICH ACCOUNTS BELONG ON THE STATEMENT -- see ADR-0014
// ---------------------------------------------------------------------
// A trial balance is complete by definition (every account, any category).
// A P&L is not: only income/directExpenses/indirectExpenses/expenses
// belong on it. SECTION_BY_CATEGORY below is that closed inclusion list,
// not exported -- same "no consumer can grow its own opinion of what a
// category means" posture js/services/accounting/contracts/
// accountContract.js's own NORMAL_BALANCE_BY_CATEGORY already takes for
// the same reason. An account whose category is absent from this map
// (every Balance Sheet/clearing category, or a future custom category) is
// excluded from the statement -- never guessed into a section.
//
// ---------------------------------------------------------------------
// WHY THIS IS A PERIOD (fromDate/toDate) REPORT, NOT AN AS-OF-DATE ONE --
// AND WHY THE FAN-OUT IS bounded THE SAME WAY 15F'S WAS (ADR-0013)
// ---------------------------------------------------------------------
// Trial Balance asks "what is every account's balance as of one date."
// P&L asks "how much did Revenue/Expense accounts move during a date
// RANGE" -- a period figure, not a point-in-time balance. Since there is
// no year-end closing entry anywhere in this schema (income/expense
// accounts carry their full lifetime running_balance, never reset to
// zero), the period's net movement is exactly closing balance minus
// opening balance -- the same subtraction js/ledgerData.js's own
// getLedgerPage() already performs for its opening/closing display, just
// applied per account across the whole (category-filtered) chart instead
// of one account at a time. That means TWO balanceAt() calls per included
// account instead of Trial Balance's one, still bounded by chart-of-
// accounts size (typically tens for an SMB), never by transaction volume
// -- the same bounded, parallelizable fan-out shape ADR-0013 established,
// not the N+1-over-transactions anti-pattern this codebase has previously
// rejected.
// =====================================================================

import { supa, getActiveCompanyId } from './supabaseClient.js';
import { balanceAt, bucketSignedBalance } from './ledgerData.js';

// Closed derivation over accounts.category's open catalog (ADR-0010's own
// pattern, extended by ADR-0014 for P&L inclusion specifically). Every
// value here is one of the four categories ADR-0014 names; every other
// category -- closed (assets/liabilities/equity/bank/cash/receivable/
// payable/gst/suspense/control/currentAssets/fixedAssets/
// currentLiabilities) or custom -- is simply absent, which is what makes
// exclusion the default for anything this map doesn't recognize, per
// ADR-0014's own "never a silent guess" rule.
const SECTION_BY_CATEGORY = Object.freeze({
  income: 'revenue',
  directExpenses: 'directExpenses',
  indirectExpenses: 'operatingExpenses',
  expenses: 'operatingExpenses' // ADR-0014: generic expenses fold into Operating
});

const PL_CATEGORIES = Object.freeze(Object.keys(SECTION_BY_CATEGORY));

/**
 * Pure: turns already-fetched accounts + already-computed per-account
 * period movements (same order, same length) into P&L sections and
 * subtotals. No Supabase, no I/O, no balance computation of its own.
 *
 * `movement` (closing balance minus opening balance) is already signed
 * relative to each account's own normal_balance, the same convention
 * v_journal_ledger_lines.running_balance itself uses (schema.sql §29) --
 * a positive movement always means "more of this account's own normal
 * side" (more revenue for a credit-normal income account, more expense
 * for a debit-normal expense account), so summing `movement` directly
 * across a section is exactly what bucketSignedBalance()'s own side logic
 * would produce (side === account.normal_balance whenever movement >= 0),
 * without a second, separate sign-conversion step. bucketSignedBalance()
 * is still called per row -- reused verbatim, not reimplemented -- purely
 * to carry the same side/amount display shape trial-balance.html's own
 * rows already have, for the same UI convention.
 *
 * Note on scope: this equivalence assumes an included account's declared
 * normal_balance agrees with its category's own derived default (true of
 * every account in this codebase's chart today -- Sales/income/credit,
 * Purchases/directExpenses/debit, Manufacturing Overhead/
 * indirectExpenses/debit). ADR-0014 does not define a P&L contra-account
 * case (e.g. a debit-normal "Sales Returns" categorized `income`); one
 * doesn't exist in this chart, and none of this milestone's own account
 * data introduces one, so it isn't handled here -- a future contributor
 * introducing a genuine P&L contra account should revisit this comment
 * before assuming subtotals stay correct unmodified.
 *
 * @param {object[]} accounts each with id/code/name/category/type/normal_balance
 * @param {number[]} movements movements[i] is accounts[i]'s signed period movement
 * @param {{includeZeroAccounts?: boolean}} [opts]
 * @returns {{
 *   revenue: object[], totalRevenue: number,
 *   directExpenses: object[], totalDirectExpenses: number,
 *   grossProfit: number,
 *   operatingExpenses: object[], totalOperatingExpenses: number,
 *   operatingProfit: number,
 *   netProfit: number
 * }}
 */
export function buildProfitAndLossRows (accounts, movements, { includeZeroAccounts = true } = {}) {
  const sections = { revenue: [], directExpenses: [], operatingExpenses: [] };

  accounts.forEach((account, i) => {
    const section = SECTION_BY_CATEGORY[account.category];
    if (!section) return; // ADR-0014: not a P&L category -- excluded, never guessed

    const movement = +movements[i] || 0;
    const { side, amount } = bucketSignedBalance(movement, account.normal_balance);
    if (!includeZeroAccounts && amount === 0) return;

    sections[section].push({ ...account, movement, side, amount });
  });

  const sum = (rows) => rows.reduce((total, row) => total + row.movement, 0);

  const totalRevenue = sum(sections.revenue);
  const totalDirectExpenses = sum(sections.directExpenses);
  const grossProfit = totalRevenue - totalDirectExpenses;
  const totalOperatingExpenses = sum(sections.operatingExpenses);
  const operatingProfit = grossProfit - totalOperatingExpenses;
  const netProfit = operatingProfit; // ADR-0014 names no Other Income/Expense section

  return {
    revenue: sections.revenue,
    totalRevenue,
    directExpenses: sections.directExpenses,
    totalDirectExpenses,
    grossProfit,
    operatingExpenses: sections.operatingExpenses,
    totalOperatingExpenses,
    operatingProfit,
    netProfit
  };
}

/**
 * The full Profit & Loss statement for the period `fromDate`..`toDate`
 * (either bound optional): every account in the company's chart of
 * accounts whose category is one of ADR-0014's four included categories,
 * each carrying its signed period movement, grouped into Revenue/Direct
 * Expenses/Operating Expenses with Gross Profit/Operating Profit/Net
 * Profit computed over already-correct per-account figures -- the same
 * category of pure reduce trialBalanceData.js's own getTrialBalance()
 * already performs.
 *
 * Opening balance for an account is 0, not "the account's life-to-date
 * balance," when `fromDate` is not set -- the exact rule
 * js/ledgerData.js's getLedgerPage() already established for its own
 * opening-balance lookup, extended here per account. Omitting `fromDate`
 * therefore produces a life-to-date P&L through `toDate` by construction,
 * not as a special case.
 * @param {{fromDate?: string|null, toDate?: string|null, includeZeroAccounts?: boolean}} [opts]
 * @returns {Promise<ReturnType<typeof buildProfitAndLossRows>>}
 */
export async function getProfitAndLoss ({ fromDate = null, toDate = null, includeZeroAccounts = true } = {}) {
  const co = getActiveCompanyId();

  const { data: accounts, error } = await supa.from('accounts')
    .select('id, code, name, category, type, normal_balance, status')
    .eq('company_id', co)
    .in('category', PL_CATEGORIES)
    .order('code', { ascending: true });
  if (error) throw error;

  const movements = await Promise.all((accounts || []).map(async (account) => {
    const [opening, closing] = await Promise.all([
      fromDate ? balanceAt(co, account.id, { before: fromDate }) : Promise.resolve(0),
      balanceAt(co, account.id, { throughInclusive: toDate })
    ]);
    return closing - opening;
  }));

  return buildProfitAndLossRows(accounts || [], movements, { includeZeroAccounts });
}
