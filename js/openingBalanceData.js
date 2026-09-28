// =====================================================================
// openingBalanceData.js
// Data layer for opening-balances.html (Milestone 15J — Accounting
// Foundation: Opening Balances & Capital Initialization). Mirrors
// js/manualJournal.js's own split: this module owns reads (the active
// fiscal period, a company's chart-of-accounts equity check, the
// duplicate-opening-entry lookup) and the write paths (posting through
// AccountingPlatform.post(), and the one narrowly-scoped account-creation
// write this milestone's brief allows) -- it never inserts into
// journal_entries/journal_lines itself, and never imports a posting
// provider, registry, or the account resolver directly.
// opening-balances.html imports and calls its own
// registerOpeningBalancePostingProvider(), the same place journal.html/
// payments.html each register their own posting provider -- not this
// data-layer module.
//
// Account search is NOT duplicated here -- js/manualJournal.js already
// exports searchAccounts(), reused directly by opening-balances.html
// exactly as ledger.html already reuses it.
//
// ---------------------------------------------------------------------
// WHY ONE FISCAL PERIOD, NOT A PICKER
// ---------------------------------------------------------------------
// create_company() (schema.sql) seeds exactly one fiscal_periods row per
// company at creation time, and there is no code path anywhere in this
// repository that ever inserts a second one -- fiscal_periods carries a
// select-only RLS policy. getApplicableFiscalPeriod() reads every period
// row a company actually has and returns the earliest one: for the
// overwhelmingly common case (exactly one row) this is simply that row;
// for the rare case of more than one (a future fiscal-period-management
// milestone, or a hand-inserted row), the earliest period is the
// accounting-correct place for an OPENING entry to belong, since it
// represents the true start of the company's books. This function
// invents no fiscal-period logic of its own -- it is a plain read against
// the same table post_journal_entry() itself authoritatively validates
// entry_date against.
// =====================================================================

import { supa, getActiveCompanyId } from './supabaseClient.js';
import {
  AccountingPlatform, VOUCHER_TYPES,
  ACCOUNT_CATEGORIES, ACCOUNT_TYPES, deriveNormalBalance
} from './services/accounting/index.js';

/**
 * The company's applicable fiscal period for an opening entry -- see the
 * file header for why this is "the earliest period that exists", not a
 * picker. Returns null when the company has no fiscal period at all
 * (should not happen for any company created through create_company(),
 * but is not assumed -- the screen must handle it visibly rather than
 * throw).
 * @returns {Promise<{id: string, fiscal_year: string, label: string, start_date: string, end_date: string, status: string}|null>}
 */
export async function getApplicableFiscalPeriod () {
  const co = getActiveCompanyId();
  const { data, error } = await supa.from('fiscal_periods')
    .select('id, fiscal_year, label, start_date, end_date, status')
    .eq('company_id', co)
    .order('start_date', { ascending: true })
    .limit(1);
  if (error) throw error;
  return (data && data[0]) || null;
}

/**
 * Whether an opening entry already exists for the given fiscal period --
 * a read-only, advisory pre-check so the screen can show "Opening balance
 * already recorded" and warn before a duplicate submission attempt. This
 * is NOT the enforcement mechanism (see postOpeningBalance()'s own
 * ref_table/ref_id argument, threaded to post_journal_entry()'s existing
 * atomic, race-safe uniqueness check) -- it exists purely for UX, and a
 * caller must never treat an empty result here as a guarantee that
 * posting will succeed.
 * @param {string} fiscalPeriodId
 * @returns {Promise<{id: string, journal_no: string, entry_date: string}|null>}
 */
export async function findExistingOpeningEntry (fiscalPeriodId) {
  if (!fiscalPeriodId) return null;
  const co = getActiveCompanyId();
  const { data, error } = await supa.from('journal_entries')
    .select('id, journal_no, entry_date')
    .eq('company_id', co)
    .eq('ref_table', 'fiscal_periods')
    .eq('ref_id', fiscalPeriodId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Whether the company's chart of accounts already has at least one active
 * equity-category account -- gates whether opening-balances.html offers
 * "Create Capital / Equity Account" at all (Decision 3: reuse an existing
 * equity account when one exists; only offer creation when none does).
 * @returns {Promise<boolean>}
 */
export async function hasEquityAccount () {
  const co = getActiveCompanyId();
  const { data, error } = await supa.from('accounts')
    .select('id')
    .eq('company_id', co)
    .eq('category', ACCOUNT_CATEGORIES.EQUITY)
    .eq('status', 'active')
    .limit(1);
  if (error) throw error;
  return !!(data && data.length);
}

/**
 * Creates exactly one minimal equity/capital account -- the narrow,
 * disclosed exception to "there is no account-creation UI" (ADR-0015),
 * approved for this milestone only because Opening Balance/Capital
 * Initialization has no other way to credit capital when the chart has
 * no equity account at all. Uses the already-existing accounts_insert RLS
 * policy directly (owner/manager only, unchanged) -- no new RPC. category
 * is fixed to 'equity' (never caller-supplied), and normal_balance is
 * derived through the existing, unmodified deriveNormalBalance() rather
 * than re-decided here.
 * @param {object} params
 * @param {string} params.code chart-of-accounts code, unique per company (DB-enforced)
 * @param {string} params.name
 * @returns {Promise<{id: string, code: string, name: string, category: string, type: string, normal_balance: string}>}
 */
export async function createEquityAccount ({ code, name }) {
  const co = getActiveCompanyId();
  if (!co) throw new Error('No active company');
  const trimmedCode = (code || '').trim();
  const trimmedName = (name || '').trim();
  if (!trimmedCode) throw new TypeError('createEquityAccount: code is required');
  if (!trimmedName) throw new TypeError('createEquityAccount: name is required');

  const { data, error } = await supa.from('accounts').insert({
    company_id: co,
    code: trimmedCode,
    name: trimmedName,
    category: ACCOUNT_CATEGORIES.EQUITY,
    type: ACCOUNT_TYPES.CAPITAL,
    normal_balance: deriveNormalBalance(ACCOUNT_CATEGORIES.EQUITY),
    is_reserved: false,
    status: 'active'
  }).select('id, code, name, category, type, normal_balance').single();
  if (error) throw error;
  return data;
}

/**
 * Posts an opening-balance/capital-initialization entry through the
 * existing AccountingPlatform.post() façade -- the only write path this
 * function ever calls for journal_entries/journal_lines. Never inserts
 * into either table directly.
 *
 * Idempotency (Decision 2, approved): ref: { table: 'fiscal_periods', id:
 * fiscalPeriodId } -- one opening entry per company per fiscal period,
 * enforced atomically and race-safely by post_journal_entry()'s own
 * existing ref_table/ref_id uniqueness. findExistingOpeningEntry() above
 * is advisory only; this is the real enforcement, and the caller must
 * still branch on the returned `wasDuplicate` rather than assume the
 * pre-check was sufficient.
 * @param {object} params
 * @param {string} params.date 'YYYY-MM-DD', must fall inside the applicable fiscal period (server-validated)
 * @param {string} params.fiscalPeriodId
 * @param {string|null} [params.reference]
 * @param {string|null} [params.narration]
 * @param {Array<{accountId: string, debit: number, credit: number, narration: string|null}>} params.lines
 * @returns {Promise<object>} AccountingPlatform.post()'s own result shape
 */
export function postOpeningBalance ({ date, fiscalPeriodId, reference = null, narration = null, lines }) {
  const co = getActiveCompanyId();
  if (!fiscalPeriodId) throw new TypeError('postOpeningBalance: fiscalPeriodId is required');
  return AccountingPlatform.post({
    companyId: co,
    voucherType: VOUCHER_TYPES.OPENING,
    sourceData: { date, reference, narration, lines },
    ref: { table: 'fiscal_periods', id: fiscalPeriodId },
    createdBy: null
  });
}
