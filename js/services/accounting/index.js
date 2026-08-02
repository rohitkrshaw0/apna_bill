// services/accounting/index.js
// The Accounting Platform Foundation (Milestone 15A). Sibling to
// reporting/, businessIntelligence/, jobs/, audit/, extensions/, events/,
// and diagnostics/ -- the ninth infrastructure platform in this
// application.
//
// FOUNDATION ONLY. Zero consumers, zero UI, zero persistence, zero schema
// change -- the exact shape Milestone 14A used for js/services/reporting/.
// Every future ERP transaction (sales, purchases, GST, payments) will
// eventually become journal entries; this platform builds the contracts,
// registries, and validators that make that possible without implementing
// any of it. Manual Journal Engine, Automatic Posting, Posting Pipeline,
// Voucher Posting, Reversals, Recurring Journals, Posting Preview, Posting
// History, Posting Approval, and Journal Persistence are Milestone 15B and
// are not started here.
//
// ---------------------------------------------------------------------
// ZERO IMPORTS OUTSIDE THIS DIRECTORY
// ---------------------------------------------------------------------
// Stronger than reporting's own non-dependency claim (reporting imports
// diagnostics/ and supabaseClient.js). Nothing under
// js/services/accounting/** imports from reporting/, businessIntelligence/,
// events/, jobs/, audit/, extensions/, dataExchange/, diagnostics/,
// js/ui/**, supabaseClient.js, or gst.js -- confirmed by grep before this
// file was written. Nothing here runs, logs, or resolves a company, so the
// platform is genuinely self-contained. Importing this module has NO side
// effects beyond constructing three empty Maps.
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
/** The application-wide posting provider registry. Empty -- no module posts yet (Milestone 15B). */
export const postingProviderRegistry = createPostingProviderRegistry();
// No fiscalPeriodService singleton here -- see the header.
