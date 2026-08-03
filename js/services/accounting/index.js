// services/accounting/index.js
// The Accounting Platform (Milestone 15A Foundation + Milestone 15B
// Journal Engine). Sibling to reporting/, businessIntelligence/, jobs/,
// audit/, extensions/, events/, and diagnostics/ -- the ninth
// infrastructure platform in this application.
//
// Milestone 15A shipped the foundation only: contracts, registries,
// validation, fiscal periods -- zero consumers, zero persistence, zero
// UI. Milestone 15B is the first real consumer: automatic posting
// providers for Sales/Purchase/Manufacturing (providers/*.js), a single
// generic posting API (AccountingPlatform.post()/reverse(), below), an
// Account Resolution Service (resolution/*.js), and the persisted
// accounts/fiscal_periods/journal_entries/journal_lines schema
// (schema.sql) + RPCs (accounting_rpc.sql) backing it. Manual Journal
// Engine, Posting Preview, Posting History, Posting Approval, and
// Recurring Journals remain out of scope, deferred to 15C+.
//
// ---------------------------------------------------------------------
// ZERO IMPORTS OUTSIDE THIS DIRECTORY -- TRUE OF contracts/, registry/,
// validation/, fiscal/ ONLY, NOT OF posting/ OR resolution/
// ---------------------------------------------------------------------
// 15A's zero-external-import claim (stronger than reporting's own, which
// imports diagnostics/ and supabaseClient.js) was always scoped to the
// foundation milestone -- see the 15A architecture doc §12, which names
// "Milestone 15B's posting pipeline" as the intended place for that
// boundary to move. posting/postingFacade.js, posting/accountingContext.js,
// and resolution/accountResolutionService.js import supabaseClient.js and
// events/ for exactly that reason. contracts/, registry/, validation/,
// and fiscal/ remain untouched and import nothing outside this directory,
// same as 15A left them.
//
// ---------------------------------------------------------------------
// THREE SINGLETONS, NOT ONE
// ---------------------------------------------------------------------
// Reporting had one registry, so it exported one singleton. This platform
// genuinely has three independent charts -- accounts, voucher types, and
// posting providers -- and a shared instance of each IS this platform's
// extension point, the same way reportRegistry is reporting's (see
// docs/architecture/ADR/0003-reporting-platform-foundation.md's own
// "registry-as-extension-point" decision, reused here rather than a
// second extension engine). There is deliberately NO fiscalPeriodService
// singleton: fyStartMonth is per-company (companies.fy_start_month), so a
// shared instance would bake one company's setting into every caller. See
// fiscal/fiscalPeriodService.js's own header.
//
// ---------------------------------------------------------------------
// PUBLIC API SURFACE -- BINDING FOR MILESTONES 15B-15F
// ---------------------------------------------------------------------
// Every module under this directory is long-term platform API, but ONLY
// WHAT THIS FILE RE-EXPORTS IS PUBLIC. Field-level validators
// (assertValidXFields), the shared/ primitives (freezeDeep, generateId,
// isoDate), the granular journal-line-error finder functions, and a few
// internal-only constants stay un-re-exported on purpose: adding an export
// later is non-breaking, removing one is, so a helper is promoted only
// when a real consumer needs it -- never preemptively. The test suite
// (accountingPlatform.test.html) imports only from this file, which is
// what proves the public surface is sufficient to exercise the platform.

// --- Money (shared/money.js) ---
export {
  roundMoney,
  toMinorUnits,
  fromMinorUnits,
  isMoneyAmount,
  MONEY_SCALE,
  MINOR_UNITS_PER_MAJOR,
  MONEY_LIMITS
} from './shared/money.js';

// --- Account contract ---
export {
  ACCOUNT_CATEGORIES,
  ACCOUNT_TYPES,
  NORMAL_BALANCES,
  ACCOUNT_STATUS,
  deriveNormalBalance,
  isDebitNormal,
  isContraAccount,
  createAccountDefinition,
  assertValidAccountDefinition
} from './contracts/accountContract.js';

// --- Account registry ---
import { createAccountRegistry } from './registry/accountRegistry.js';
export { createAccountRegistry };

// --- Journal contract ---
export {
  VOUCHER_TYPES,
  POSTING_SOURCES,
  createJournalLine,
  createJournalEntry,
  assertValidJournalLine,
  assertValidJournalEntry
} from './contracts/journalContract.js';

// --- Voucher type contract + registry ---
export {
  VOUCHER_CATEGORIES,
  createVoucherTypeDefinition,
  assertValidVoucherTypeDefinition
} from './contracts/voucherTypeContract.js';
import { createVoucherTypeRegistry } from './registry/voucherTypeRegistry.js';
export { createVoucherTypeRegistry };

// --- Posting provider contract + registry ---
export {
  createPostingProviderDefinition,
  assertValidPostingProviderDefinition
} from './contracts/postingProviderContract.js';
import { createPostingProviderRegistry } from './registry/postingProviderRegistry.js';
export { createPostingProviderRegistry };

// --- Validation ---
export { formatValidationErrors } from './validation/validationResult.js';
export {
  JOURNAL_ERROR_CODES,
  computeEntryTotals,
  isBalanced,
  validateJournalEntry,
  assertBalancedJournalEntry
} from './validation/journalEntryValidator.js';

// --- Fiscal periods ---
export { resolveFiscalYearLabel, resolveFiscalYearBounds, DEFAULT_FY_START_MONTH } from './fiscal/fiscalYear.js';
export {
  FISCAL_PERIOD_STATUS,
  createFiscalPeriod,
  assertValidFiscalPeriod,
  toClosed,
  toReopened,
  toLocked,
  canPostToPeriod,
  isDateWithinPeriod
} from './fiscal/fiscalPeriodContract.js';
export { createFiscalPeriodService } from './fiscal/fiscalPeriodService.js';

/** The application-wide chart of accounts. Empty until a future milestone registers an account. */
export const accountRegistry = createAccountRegistry();
/** The application-wide voucher type registry. Empty until a future milestone registers a voucher type. */
export const voucherTypeRegistry = createVoucherTypeRegistry();
/**
 * The application-wide posting provider registry. Sales/Purchase/Manufacturing
 * (Milestone 15B) register onto this shared instance -- see js/sales.js,
 * js/purchases.js, js/manufacturing.js, each importing their own
 * registerXPostingProvider() from providers/*.js at module load.
 */
export const postingProviderRegistry = createPostingProviderRegistry();
// No fiscalPeriodService singleton here -- see the header.

// ---------------------------------------------------------------------
// Account Resolution (Milestone 15B design decision #6)
// ---------------------------------------------------------------------
export { ACCOUNT_ROLES, RESOLUTION_ERROR_CODES, AccountResolutionError } from './resolution/accountResolutionContract.js';
export { createAccountResolutionService } from './resolution/accountResolutionService.js';

// ---------------------------------------------------------------------
// AccountingPlatform -- the public posting API (Milestone 15B design
// decision #5: a generic post()/reverse(), not a voucher-specific one).
// Wired here, at the bottom of this file, against the shared
// postingProviderRegistry singleton above -- posting/postingFacade.js
// itself imports nothing from this file (it takes the registry as a
// parameter instead), so this is a one-directional import: index.js ->
// posting/postingFacade.js, never the reverse. providers/*.js DO import
// the postingProviderRegistry singleton from this file to register onto
// it, which is the same one-directional shape (index.js is never
// imported by providers/*.js's own dependents in a cycle).
// ---------------------------------------------------------------------
export { POSTING_ERROR_CODES, describePostingFailure } from './posting/postingErrorCodes.js';
import { createPostingFacade } from './posting/postingFacade.js';
const _postingFacade = createPostingFacade({ postingProviderRegistry });
/** The only way any business module posts a journal entry or reverses one. See posting/postingFacade.js. */
export const AccountingPlatform = Object.freeze({ post: _postingFacade.post, reverse: _postingFacade.reverse });
