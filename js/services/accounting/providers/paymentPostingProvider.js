// providers/paymentPostingProvider.js
// The Payment automatic posting provider (Milestone 15I) -- the mirror
// image of receiptPostingProvider.js: a supplier payment debits accounts
// payable and credits cash. See that file's header for the reasoning
// shared by both (every settlement debits/credits cashAccount regardless
// of payment_type, ADR-0016 Decision 1; no round-off line is ever
// emitted) -- not re-argued here.
//
// sourceData shape (built by paymentData.js after record_payment()
// succeeds):
//   { date, amount, documentNo, reference }

import { createPostingProviderDefinition } from '../contracts/postingProviderContract.js';
import { VOUCHER_TYPES, POSTING_SOURCES } from '../contracts/journalContract.js';
import { ACCOUNT_ROLES } from '../resolution/accountResolutionContract.js';
import { amountLine } from './postingProviderHelpers.js';
import { postingProviderRegistry } from '../index.js';

/**
 * @param {object} sourceData see file header
 * @param {{resolver: ReturnType<import('../resolution/accountResolutionService.js').createAccountResolutionService>}} deps
 * @returns {{date: string, reference: string|null, narration: string|null, lines: object[], metadata: object}}
 */
export function buildPaymentJournalEntry (sourceData, { resolver }) {
  const { date, amount, documentNo = null, reference = null } = sourceData || {};
  if (!date) throw new TypeError('buildPaymentJournalEntry: sourceData.date is required');
  if (typeof amount !== 'number' || !(amount > 0)) {
    throw new TypeError('buildPaymentJournalEntry: sourceData.amount must be a positive number');
  }

  const rounded = Math.round(amount * 100) / 100;
  const lines = [
    amountLine(resolver.resolve(ACCOUNT_ROLES.ACCOUNTS_PAYABLE), 'debit', rounded),
    amountLine(resolver.resolve(ACCOUNT_ROLES.CASH_ACCOUNT), 'credit', rounded)
  ].filter(Boolean);

  return {
    date,
    reference: reference || documentNo || null,
    narration: documentNo ? `Payment against ${documentNo}` : 'Payment',
    lines,
    metadata: {}
  };
}

export const paymentPostingProviderDefinition = createPostingProviderDefinition({
  id: 'paymentPostingProvider',
  name: 'Payment',
  description: 'Posts a balanced journal entry for a supplier payment settling an outstanding purchase bill: accounts payable against cash.',
  sourceModule: POSTING_SOURCES.PAYMENT,
  voucherTypes: [VOUCHER_TYPES.PAYMENT],
  buildJournalEntry: buildPaymentJournalEntry
});

/** Idempotent -- see receiptPostingProvider.js's own registration comment. */
export function registerPaymentPostingProvider () {
  if (!postingProviderRegistry.has(paymentPostingProviderDefinition.id)) {
    postingProviderRegistry.register(paymentPostingProviderDefinition);
  }
  return paymentPostingProviderDefinition;
}
