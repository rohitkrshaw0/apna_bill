// providers/receiptPostingProvider.js
// The Receipt automatic posting provider (Milestone 15I). Registered onto
// the shared postingProviderRegistry singleton (index.js), the same way
// salesPostingProvider.js/purchasePostingProvider.js already are --
// nothing outside this file ever calls buildJournalEntry() directly.
//
// sourceData shape (built by paymentData.js after record_payment()
// succeeds -- record_payment()'s own RPC response carries the settled
// amount and identifiers, but the caller already holds the figures it
// needs before calling the RPC at all, the same "no money travels back
// through the RPC response" shape sales.js/purchases.js already use):
//   { date, amount, documentNo, reference }
//
// ---------------------------------------------------------------------
// WHY EVERY RECEIPT DEBITS cashAccount (ADR-0016 Decision 1)
// ---------------------------------------------------------------------
// payment_types has no account mapping and the seeded chart has no bank
// account (see accountResolutionContract.js's own header, unchanged by
// this milestone). Every receipt therefore debits CASH_ACCOUNT regardless
// of the payment_type the user records -- exactly the same simplification
// salesPostingProvider.js already makes for the amount received at
// invoice time. payment_type_id is stored on the payments row for
// display; it is not resolved into an account here.
//
// ---------------------------------------------------------------------
// WHY THIS PROVIDER NEVER EMITS A ROUND-OFF LINE
// ---------------------------------------------------------------------
// A settlement moves exactly the amount recorded against exactly the
// outstanding balance recorded -- there is no independent tax/discount
// arithmetic here the way there is in a sale/purchase invoice, so there
// is nothing that can produce a sub-rupee residual. A two-line entry is
// therefore always exactly balanced by construction.

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
export function buildReceiptJournalEntry (sourceData, { resolver }) {
  const { date, amount, documentNo = null, reference = null } = sourceData || {};
  if (!date) throw new TypeError('buildReceiptJournalEntry: sourceData.date is required');
  if (typeof amount !== 'number' || !(amount > 0)) {
    throw new TypeError('buildReceiptJournalEntry: sourceData.amount must be a positive number');
  }

  const rounded = Math.round(amount * 100) / 100;
  const lines = [
    amountLine(resolver.resolve(ACCOUNT_ROLES.CASH_ACCOUNT), 'debit', rounded),
    amountLine(resolver.resolve(ACCOUNT_ROLES.ACCOUNTS_RECEIVABLE), 'credit', rounded)
  ].filter(Boolean);

  return {
    date,
    reference: reference || documentNo || null,
    narration: documentNo ? `Receipt against ${documentNo}` : 'Receipt',
    lines,
    metadata: {}
  };
}

export const receiptPostingProviderDefinition = createPostingProviderDefinition({
  id: 'receiptPostingProvider',
  name: 'Receipt',
  description: 'Posts a balanced journal entry for a customer receipt settling an outstanding invoice: cash against accounts receivable.',
  sourceModule: POSTING_SOURCES.PAYMENT,
  voucherTypes: [VOUCHER_TYPES.RECEIPT],
  buildJournalEntry: buildReceiptJournalEntry
});

/** Idempotent -- safe to call from more than one module-load path (see reporting's own registerXReport() precedent). */
export function registerReceiptPostingProvider () {
  if (!postingProviderRegistry.has(receiptPostingProviderDefinition.id)) {
    postingProviderRegistry.register(receiptPostingProviderDefinition);
  }
  return receiptPostingProviderDefinition;
}
