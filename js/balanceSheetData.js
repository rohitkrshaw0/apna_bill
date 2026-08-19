// =====================================================================
// balanceSheetData.js
// Read-only data-access layer for the Balance Sheet Platform (Milestone
// 15H) -- the ONLY place balance-sheet.html touches Supabase. Every
// balance figure comes from js/ledgerData.js's balanceAt(), reused
// verbatim, and the entire equity profit figure comes from
// js/profitLossData.js's buildProfitAndLossRows(), also reused verbatim.
// This file computes no balance and no profit of its own -- the same
// "zero duplicated accounting logic" rule 15E's v_journal_ledger_lines
// (ADR-0012) established, 15F's trialBalanceData.js followed, and 15G's
// profitLossData.js followed again.
//
// ---------------------------------------------------------------------
// CLASSIFICATION IS CATEGORY-FIRST -- see ADR-0015
// ---------------------------------------------------------------------
// ADR-0014 recorded which categories are P&L categories and invited this
// milestone to cite its EXCLUDED list as this one's INCLUDED set rather
// than re-deriving it. SECTION_BY_CATEGORY below is exactly that list.
// Together the two ADRs partition ACCOUNT_CATEGORIES' 17 values
// exhaustively: no category is in both, and none is in neither.
//
// gst/suspense/control are handled separately (BY_NORMAL_BALANCE below)
// because ADR-0010 deliberately leaves them OUT of the normal-balance
// derivation table -- Input GST is an asset, Output GST is a liability,
// so the category genuinely has no single answer and each such account
// must declare its own normal_balance. For those three categories, and
// only those three, that declared value resolves the section. It is not
// the primary classifier: a normal_balance-first rule would file
// Accumulated Depreciation (fixedAssets + credit-normal, ADR-0010's own
// worked contra example) under Liabilities.
//
// Classification NEVER consults the sign of the balance. Section is a
// function of category + declared normal_balance, both fixed at Chart of
// Accounts registration -- so an account never jumps sections between two
// as-of dates merely because its balance moved. An overdrawn bank account
// stays an asset showing a negative figure.
//
// ---------------------------------------------------------------------
// WHY AN UNRECOGNIZED CATEGORY IS VISIBLE HERE, BUT SILENT IN P&L
// ---------------------------------------------------------------------
// ADR-0014 can safely make silent exclusion its default: leaving a
// Balance Sheet account off an income statement is the statement working
// as designed, not a guess. This screen has no such luxury -- a silently
// excluded account breaks Assets = Liabilities + Equity by exactly its
// own balance, turning a chart-of-accounts defect into an unexplained
// wrong statement. So an unrecognized category lands in a VISIBLE
// 'unclassified' section (credit sense, on the Liabilities + Equity
// side), the extended identity still foots, and the primary
// reconciliation correctly reports that investigation is required. What
// gets fixed is the account's category, not this statement.
//
// ---------------------------------------------------------------------
// EQUITY IS DERIVED, BECAUSE THIS REPOSITORY HAS NO EQUITY ACCOUNTS AND
// NO CLOSING ENTRY
// ---------------------------------------------------------------------
// bootstrap_accounting_defaults() (schema.sql §23) is the only code path
// in this repository that creates an account, and its 16-account seed
// contains no `equity` account at all. accounting_rpc.sql defines exactly
// three functions -- next_journal_number/post_journal_entry/
// reverse_journal_entry -- none of which is a period or year-end close.
// So income and expense accounts carry their full lifetime
// running_balance and are never reset, which makes life-to-date net
// profit through the as-of date exactly equal to accumulated profit --
// not an approximation of it.
//
// That single figure is split at the current fiscal year's start into
// "brought forward" and "for the period" (they sum back to it exactly,
// since movement = closing - opening telescopes). Both come from
// buildProfitAndLossRows(), called twice with different movement arrays:
// that function already self-filters to ADR-0014's four categories, so
// this file passes it the whole chart and reads .netProfit off the
// result. There is no second P&L calculation here and no reimplementation
// of P&L category filtering.
//
// NOT called "Retained Earnings", deliberately: that names an account
// holding a balance a closing entry transferred into it, and this
// repository has neither. See ADR-0015 Decision 5.
//
// ---------------------------------------------------------------------
// FIRST DATA MODULE TO IMPORT services/accounting/index.js
// ---------------------------------------------------------------------
// 15D established that a SCREEN may (journal-detail.html imports
// computeEntryTotals/isBalanced/toMinorUnits); no data module had. Both
// fiscal-year functions imported below are already on that public
// surface, so nothing is added to it. Re-deriving the fiscal-year
// boundary inline instead would duplicate logic that fiscalYear.js's own
// header records as deliberately bug-compatible with Postgres
// current_fy() -- a JS fiscal-year calculation that disagrees with the
// database on any date is a live data-integrity bug, which is exactly
// what that module exists to prevent.
//
// ---------------------------------------------------------------------
// WHY THE FAN-OUT IS BOUNDED, AND WHY THERE IS NO PAGINATION
// ---------------------------------------------------------------------
// One accounts read, one getActiveCompany() read, and two balanceAt()
// calls per account: the as-of-date balance (the statement's own figures)
// and a fiscal-year-opening balance (needed only to split the derived
// profit). N = chart-of-accounts size -- typically tens for an SMB --
// never transaction volume, and every call is parallel.
//
// The fiscal-year fan-out deliberately covers the WHOLE chart rather than
// only the P&L subset. Restricting it would save a handful of bounded,
// indexed single-row lookups at the cost of putting a second copy of
// ADR-0014's category list on the query path, where a drift between that
// copy and buildProfitAndLossRows()' own list would silently corrupt the
// brought-forward figure. Not worth it at this scale.
//
// ADR-0013's proof that no single-query technique is correct for an
// arbitrary historical date, and its explicit RPC threshold, both apply
// here unchanged.
//
// Every account is fetched at every status, including 'inactive':
// omitting an inactive account that still carries a historical balance
// would break the identity outright. And the statement is never
// paginated -- a Balance Sheet must reconcile as one whole, so a page of
// one is not a smaller Balance Sheet, it is a non-statement.
// =====================================================================

import { supa, getActiveCompanyId, getActiveCompany } from './supabaseClient.js';
import { balanceAt, bucketSignedBalance } from './ledgerData.js';
import { buildProfitAndLossRows } from './profitLossData.js';
import { resolveFiscalYearLabel, resolveFiscalYearBounds } from './services/accounting/index.js';

// ADR-0015 Decision 1. Exactly ADR-0014's excluded list, minus the three
// categories that carry no derived normal balance (below). Not exported --
// same "no consumer can grow its own opinion of what a category means"
// posture NORMAL_BALANCE_BY_CATEGORY and SECTION_BY_CATEGORY already take.
const SECTION_BY_CATEGORY = Object.freeze({
  assets: 'assets',
  currentAssets: 'assets',
  fixedAssets: 'assets',
  bank: 'assets',
  cash: 'assets',
  receivable: 'assets',
  liabilities: 'liabilities',
  currentLiabilities: 'liabilities',
  payable: 'liabilities',
  equity: 'equity'
});

// ADR-0015 Decision 2. Deliberately absent from ADR-0010's derivation
// table, so each such account declares its own normal_balance -- and that
// declared value, never the balance's sign, resolves the section.
const BY_NORMAL_BALANCE = Object.freeze(['gst', 'suspense', 'control']);

// ADR-0014's four included categories. Listed here only so an account in
// one is recognised as "correctly not a Balance Sheet line" rather than
// falling through to 'unclassified' -- its balance reaches the statement
// through the derived equity profit figures instead. This is a reference
// to ADR-0014's list, not a second opinion about it: buildProfitAndLossRows()
// remains the only thing that acts on P&L membership.
const PL_CATEGORIES = Object.freeze(['income', 'directExpenses', 'indirectExpenses', 'expenses']);

// Which direction each section totals in. Assets read debit-sense;
// everything on the other side of the statement reads credit-sense.
const SECTION_SENSE = Object.freeze({
  assets: 'debit',
  liabilities: 'credit',
  equity: 'credit',
  unclassified: 'credit'
});

/**
 * Pure: which Balance Sheet section an account belongs to, or
 * `'profitAndLoss'` for an account whose balance reaches the statement
 * through derived equity instead of as its own line, or `'unclassified'`
 * for a category this partition does not recognize (ADR-0015 Decision 3 --
 * visible, never silently dropped).
 *
 * Exhaustive over ACCOUNT_CATEGORIES' 17 values by construction, and
 * total for any string beyond them. Exported for unit testing; the
 * classification tables themselves stay private.
 * @param {{category: string, normal_balance: string}} account
 * @returns {'assets'|'liabilities'|'equity'|'profitAndLoss'|'unclassified'}
 */
export function classifyAccount (account) {
  const category = account?.category;

  const section = SECTION_BY_CATEGORY[category];
  if (section) return section;

  // ADR-0010's "must declare normalBalance explicitly" rule, consumed at
  // the one place that ambiguity actually bites.
  if (BY_NORMAL_BALANCE.includes(category)) {
    return account.normal_balance === 'credit' ? 'liabilities' : 'assets';
  }

  if (PL_CATEGORIES.includes(category)) return 'profitAndLoss';

  return 'unclassified';
}

/**
 * Pure: an account's balance expressed in its SECTION's direction rather
 * than its own (ADR-0015 Decision 6).
 *
 * balanceAt() returns a balance signed relative to the account's own
 * normal_balance. bucketSignedBalance() turns that into a side plus an
 * absolute magnitude -- exactly right for a per-row Dr/Cr display, and
 * exactly wrong for a section subtotal, because it discards the direction
 * a contra account needs in order to SUBTRACT. Accumulated Depreciation
 * (fixedAssets, credit-normal, balance +2000) must reduce Total Assets by
 * 2000, not add to it.
 *
 * bucketSignedBalance() is deliberately neither modified nor replaced --
 * it is shared with ledger.html and trial-balance.html, where its shape is
 * correct, and this screen still calls it per row for the same Dr/Cr
 * display convention.
 * @param {number} signedBalance signed relative to the account's own normal_balance
 * @param {'debit'|'credit'} normalBalance the account's declared normal balance
 * @param {'debit'|'credit'} sectionSense the direction its section totals in
 * @returns {number}
 */
export function toSectionAmount (signedBalance, normalBalance, sectionSense) {
  return (+signedBalance || 0) * (normalBalance === sectionSense ? 1 : -1);
}

/**
 * Pure: turns already-fetched accounts + already-computed per-account
 * as-of-date balances (same order, same length) into Balance Sheet
 * sections, section totals, derived equity, and the reconciliation
 * figures. No Supabase, no I/O, no balance computation and no profit
 * computation of its own -- the profit figures are supplied by the
 * caller, which obtains them from buildProfitAndLossRows().
 *
 * `broughtForward` and `periodProfit` are both credit-sense net-profit
 * figures (positive = profit), which is already the sense the equity side
 * totals in, so they add to Total Equity directly with no second
 * conversion step. Their sum is life-to-date accumulated profit through
 * the as-of date, exactly.
 *
 * The reconciliation holds by construction, not by assertion: every
 * posted entry satisfies sum(debit) = sum(credit) (post_journal_entry()'s
 * own DB-side assertion, ADR-0008), so summing every account in debit
 * sense across the whole chart is exactly zero, and partitioning that sum
 * by the exhaustive classification above rearranges to
 * Assets = Liabilities + Equity + Unclassified. See ADR-0015 Decision 8.
 *
 * @param {object[]} accounts each with id/code/name/category/type/normal_balance
 * @param {number[]} balances balances[i] is accounts[i]'s signed as-of-date balance
 * @param {{broughtForward?: number, periodProfit?: number, includeZeroAccounts?: boolean}} [opts]
 * @returns {{
 *   assets: object[], totalAssets: number,
 *   liabilities: object[], totalLiabilities: number,
 *   equityAccounts: object[], totalEquityAccounts: number,
 *   broughtForward: number, periodProfit: number, accumulatedProfit: number,
 *   totalEquity: number,
 *   unclassified: object[], totalUnclassified: number,
 *   totalLiabilitiesAndEquity: number, difference: number
 * }}
 */
export function buildBalanceSheetSections (accounts, balances, {
  broughtForward = 0, periodProfit = 0, includeZeroAccounts = true
} = {}) {
  const sections = { assets: [], liabilities: [], equity: [], unclassified: [] };

  accounts.forEach((account, i) => {
    const section = classifyAccount(account);
    // A P&L account is correctly not a Balance Sheet line -- its balance
    // reaches the statement through the derived equity figures instead.
    if (section === 'profitAndLoss') return;

    const balance = +balances[i] || 0;
    const sectionSense = SECTION_SENSE[section];
    const amount = toSectionAmount(balance, account.normal_balance, sectionSense);
    // Reused verbatim, not reimplemented -- the same side/amount display
    // shape trial-balance.html's own rows carry.
    const { side } = bucketSignedBalance(balance, account.normal_balance);

    if (!includeZeroAccounts && amount === 0) return;

    sections[section].push({ ...account, balance, side, amount });
  });

  const sum = (rows) => rows.reduce((total, row) => total + row.amount, 0);

  const totalAssets = sum(sections.assets);
  const totalLiabilities = sum(sections.liabilities);
  const totalEquityAccounts = sum(sections.equity);
  const totalUnclassified = sum(sections.unclassified);

  const bf = +broughtForward || 0;
  const pp = +periodProfit || 0;
  const accumulatedProfit = bf + pp;
  const totalEquity = totalEquityAccounts + accumulatedProfit;
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;

  return {
    assets: sections.assets,
    totalAssets,
    liabilities: sections.liabilities,
    totalLiabilities,
    equityAccounts: sections.equity,
    totalEquityAccounts,
    broughtForward: bf,
    periodProfit: pp,
    accumulatedProfit,
    totalEquity,
    unclassified: sections.unclassified,
    totalUnclassified,
    totalLiabilitiesAndEquity,
    // The PRIMARY statement equation, Assets = Liabilities + Equity.
    // Unclassified is deliberately NOT folded in here: when it is
    // non-empty this difference is exactly what it accounts for, and the
    // screen must show that rather than absorb it (ADR-0015 Decision 3).
    difference: totalAssets - totalLiabilitiesAndEquity
  };
}

/**
 * The full Balance Sheet as of `asOfDate` (or as of every account's
 * latest activity when null): every account in the company's chart of
 * accounts at every status, classified into Assets/Liabilities/Equity/
 * Unclassified, with equity's two derived profit components.
 *
 * Query shape: one `accounts` read, then one balanceAt() per account in
 * parallel -- identical cost to Trial Balance. The brought-forward split
 * adds one getActiveCompany() read (for companies.fy_start_month) and one
 * further balanceAt() per account bounded at the fiscal-year start.
 *
 * @param {{asOfDate?: string|null, includeZeroAccounts?: boolean}} [opts]
 * @returns {Promise<ReturnType<typeof buildBalanceSheetSections> & {fyStartDate: string|null}>}
 */
export async function getBalanceSheet ({ asOfDate = null, includeZeroAccounts = true } = {}) {
  const co = getActiveCompanyId();

  const [{ data: accounts, error }, company] = await Promise.all([
    supa.from('accounts')
      .select('id, code, name, category, type, normal_balance, status')
      .eq('company_id', co)
      .order('code', { ascending: true }),
    getActiveCompany()
  ]);
  if (error) throw error;

  const rows = accounts || [];

  // The fiscal year containing the as-of date. With no as-of date the
  // statement is "as of now", so the current fiscal year is the right
  // boundary -- resolved through the accounting platform's own functions,
  // never re-derived here (see the header).
  const fyStartDate = resolveFyStartDate(asOfDate, company?.fy_start_month);

  // As-of-date balance per account (the Balance Sheet's own figures), and
  // the fiscal-year opening balance per account (only needed to split the
  // derived profit). Both bounded fan-outs, both parallel.
  const [balances, fyOpeningBalances] = await Promise.all([
    Promise.all(rows.map((a) => balanceAt(co, a.id, { throughInclusive: asOfDate }))),
    Promise.all(rows.map((a) => balanceAt(co, a.id, { before: fyStartDate })))
  ]);

  // Both equity profit components come from 15G's own exported pure
  // function, reused unmodified -- it self-filters to ADR-0014's four
  // categories, so the whole chart goes in and .netProfit comes out.
  //
  // Life-to-date movements are the as-of-date balances themselves: with
  // no opening bound, movement = closing - 0 = closing. The same rule
  // getLedgerPage() established for its own opening balance, and the same
  // one getProfitAndLoss() applies when fromDate is null.
  const broughtForward = buildProfitAndLossRows(rows, fyOpeningBalances).netProfit;
  const lifeToDateProfit = buildProfitAndLossRows(rows, balances).netProfit;
  // Subtraction, not a third fan-out: the period's movement is exactly
  // life-to-date minus brought-forward, so the two components sum back to
  // life-to-date accumulated profit by construction (ADR-0015 Decision 4).
  const periodProfit = lifeToDateProfit - broughtForward;

  return {
    ...buildBalanceSheetSections(rows, balances, { broughtForward, periodProfit, includeZeroAccounts }),
    fyStartDate
  };
}

/**
 * The start date of the fiscal year containing `asOfDate` (or containing
 * today, when the statement carries no as-of date), via the accounting
 * platform's own fiscal-year functions -- never re-derived here, since a
 * JS fiscal-year calculation that disagrees with Postgres current_fy() on
 * any date is a live data-integrity bug (fiscalYear.js's own header).
 *
 * An out-of-range or missing companies.fy_start_month falls through to
 * `undefined`, which both platform functions resolve to their own
 * DEFAULT_FY_START_MONTH (April) -- the same default companies.fy_start_month
 * itself carries in schema.sql.
 * @param {string|null} asOfDate 'YYYY-MM-DD'
 * @param {number|null|undefined} fyStartMonth companies.fy_start_month
 * @returns {string} 'YYYY-MM-DD'
 */
function resolveFyStartDate (asOfDate, fyStartMonth) {
  const date = asOfDate || new Date().toISOString().slice(0, 10);
  const month = Number(fyStartMonth);
  const fy = Number.isInteger(month) && month >= 1 && month <= 12 ? month : undefined;

  return resolveFiscalYearBounds(resolveFiscalYearLabel(date, fy), fy).startDate;
}
