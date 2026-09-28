// providers/openingBalancePostingProvider.js
// The Opening Balance / Capital Initialization posting provider
// (Milestone 15J). Registered onto the shared postingProviderRegistry
// singleton (index.js) so AccountingPlatform.post({ voucherType: 'opening',
// ... }) can find it -- opening-balances.html never touches
// postingProviderRegistry, a provider, or post_journal_entry() directly.
//
// ---------------------------------------------------------------------
// WHY THIS FOLLOWS manualJournalPostingProvider.js, NOT A ROLE-RESOLVING
// PROVIDER
// ---------------------------------------------------------------------
// Sales/Purchase/Manufacturing/Payments resolve a business ROLE to an
// accountId because those callers never let a user pick an account
// directly. An opening balance entry is the same shape as a manual
// journal: the user already picked real accountIds through
// opening-balances.html's own account lookup (js/manualJournal.js's
// searchAccounts(), reused unmodified -- the same picker journal.html and
// ledger.html already share). There is no role to resolve here, and this
// function's only job is to carry the already-built header/lines through
// to the same createJournalEntry() + validateJournalEntry() +
// post_journal_entry() pipeline every other voucher type goes through.
// `resolver` is accepted (the façade always passes one) but genuinely
// unused, which is why it's destructured and discarded rather than typed
// away.
//
// sourceData shape (built by opening-balances.html before calling
// AccountingPlatform.post()):
//   { date, reference, narration, lines: [{ accountId, debit, credit,
//     narration }] }
// Amount validation (paise-representable, non-negative, exactly-one-side)
// and balance validation happen downstream in
// createJournalEntry()/validateJournalEntry() -- this provider does not
// duplicate either check. Idempotency (one opening entry per company per
// fiscal period) is the caller's job: it passes
// ref: { table: 'fiscal_periods', id: fiscalPeriodId } to
// AccountingPlatform.post(), which threads it to post_journal_entry()'s
// own existing ref_table/ref_id uniqueness -- nothing here duplicates
// that mechanism.

import { createPostingProviderDefinition } from '../contracts/postingProviderContract.js';
import { VOUCHER_TYPES, POSTING_SOURCES } from '../contracts/journalContract.js';
import { postingProviderRegistry } from '../index.js';

/**
 * @param {object} sourceData see file header
 * @param {{resolver: ReturnType<import('../resolution/accountResolutionService.js').createAccountResolutionService>}} _deps unused -- see file header
 * @returns {{date: string, reference: string|null, narration: string|null, lines: object[], metadata: object}}
 */
export function buildOpeningBalanceJournalEntry (sourceData, _deps) {
  const { date, reference = null, narration = null, lines } = sourceData || {};
  if (!date) throw new TypeError('buildOpeningBalanceJournalEntry: sourceData.date is required');
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new TypeError('buildOpeningBalanceJournalEntry: sourceData.lines must be a non-empty array');
  }

  return {
    date,
    reference,
    narration,
    lines: lines.map(({ accountId, debit = 0, credit = 0, narration: lineNarration = null }) => ({
      accountId, debit, credit, narration: lineNarration
    })),
    metadata: {}
  };
}

export const openingBalancePostingProviderDefinition = createPostingProviderDefinition({
  id: 'openingBalancePostingProvider',
  name: 'Opening Balance',
  description: 'Posts a user-authored opening-balance/capital-initialization entry: the lines are already complete, real accountIds -- no role resolution.',
  sourceModule: POSTING_SOURCES.OPENING,
  voucherTypes: [VOUCHER_TYPES.OPENING],
  buildJournalEntry: buildOpeningBalanceJournalEntry
});

/** Idempotent -- see salesPostingProvider.js's own registration comment. */
export function registerOpeningBalancePostingProvider () {
  if (!postingProviderRegistry.has(openingBalancePostingProviderDefinition.id)) {
    postingProviderRegistry.register(openingBalancePostingProviderDefinition);
  }
  return openingBalancePostingProviderDefinition;
}
