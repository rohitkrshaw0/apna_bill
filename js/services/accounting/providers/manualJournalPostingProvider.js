// providers/manualJournalPostingProvider.js
// The Manual Journal posting provider (Milestone 15C). Registered onto the
// shared postingProviderRegistry singleton (index.js) so
// AccountingPlatform.post({ voucherType: 'journal', ... }) can find it --
// journal.html never touches postingProviderRegistry, a provider, or
// post_journal_entry() directly.
//
// ---------------------------------------------------------------------
// WHY THIS PROVIDER DOES NOT CALL resolver.resolve()
// ---------------------------------------------------------------------
// Sales/Purchase/Manufacturing resolve a business ROLE (salesAccount,
// outputCgstAccount, ...) to an accountId, because those callers never let
// a user pick an account directly. A manual journal is the opposite case:
// the user already picked real accountIds through journal.html's own
// account lookup (a direct, RLS-scoped read of the `accounts` table, the
// same pattern sale.html already uses for its item search). There is no
// role to resolve here -- this function's only job is to carry the
// already-built header/lines through to the same createJournalEntry() +
// validateJournalEntry() + post_journal_entry() pipeline every other
// voucher type goes through. `resolver` is accepted (the façade always
// passes one) but genuinely unused, which is why it's destructured and
// discarded rather than typed away -- a future line that *does* need role
// resolution (e.g. a suspense-account default) has somewhere to put it
// without a signature change.
//
// sourceData shape (built by journal.html before calling
// AccountingPlatform.post()):
//   { date, reference, narration, lines: [{ accountId, debit, credit,
//     narration }] }
// Amount validation (paise-representable, non-negative, exactly-one-side)
// and balance validation happen downstream in
// createJournalEntry()/validateJournalEntry() -- this provider does not
// duplicate either check.

import { createPostingProviderDefinition } from '../contracts/postingProviderContract.js';
import { VOUCHER_TYPES, POSTING_SOURCES } from '../contracts/journalContract.js';
import { postingProviderRegistry } from '../index.js';

/**
 * @param {object} sourceData see file header
 * @param {{resolver: ReturnType<import('../resolution/accountResolutionService.js').createAccountResolutionService>}} _deps unused -- see file header
 * @returns {{date: string, reference: string|null, narration: string|null, lines: object[], metadata: object}}
 */
export function buildManualJournalEntry (sourceData, _deps) {
  const { date, reference = null, narration = null, lines } = sourceData || {};
  if (!date) throw new TypeError('buildManualJournalEntry: sourceData.date is required');
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new TypeError('buildManualJournalEntry: sourceData.lines must be a non-empty array');
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

export const manualJournalPostingProviderDefinition = createPostingProviderDefinition({
  id: 'manualJournalPostingProvider',
  name: 'Manual Journal',
  description: 'Posts a user-authored journal entry: the lines are already complete, real accountIds -- no role resolution.',
  sourceModule: POSTING_SOURCES.MANUAL,
  voucherTypes: [VOUCHER_TYPES.JOURNAL],
  buildJournalEntry: buildManualJournalEntry
});

/** Idempotent -- see salesPostingProvider.js's own registration comment. */
export function registerManualJournalPostingProvider () {
  if (!postingProviderRegistry.has(manualJournalPostingProviderDefinition.id)) {
    postingProviderRegistry.register(manualJournalPostingProviderDefinition);
  }
  return manualJournalPostingProviderDefinition;
}
