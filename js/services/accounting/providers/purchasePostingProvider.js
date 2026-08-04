// providers/purchasePostingProvider.js
// The Purchase automatic posting provider (Milestone 15B). The mirror
// image of salesPostingProvider.js: purchases and input GST are debited,
// cash paid / accounts payable are credited. See that file's header for
// the reasoning shared by both (net-of-discount recording, lazy rounding
// account resolution) -- not re-argued here.
//
// sourceData shape (built by purchases.js after create_purchase succeeds):
//   { date, billNo, totals: { subtotal, discount_total, cgst_total,
//     sgst_total, igst_total, cess_total, grand_total }, roundOff,
//     amountPaid }
//
// ---------------------------------------------------------------------
// WHY THE ROUND-OFF LINE'S SIDE IS THE OPPOSITE OF SALES'S
// ---------------------------------------------------------------------
// For a sale, cash+receivable (fixed at grand_total) sit on the debit
// side, so a positive round_off is credited to close the gap. For a
// purchase, cash paid + accounts payable (fixed at grand_total) sit on
// the CREDIT side instead, so a positive round_off is DEBITED to close
// the same gap -- the algebra is symmetric, the account role is not.

import { createPostingProviderDefinition } from '../contracts/postingProviderContract.js';
import { VOUCHER_TYPES, POSTING_SOURCES } from '../contracts/journalContract.js';
import { ACCOUNT_ROLES } from '../resolution/accountResolutionContract.js';
import { amountLine, signedLine } from './postingProviderHelpers.js';
import { postingProviderRegistry } from '../index.js';

/**
 * @param {object} sourceData see file header
 * @param {{resolver: ReturnType<import('../resolution/accountResolutionService.js').createAccountResolutionService>}} deps
 * @returns {{date: string, reference: string|null, narration: string|null, lines: object[], metadata: object}}
 */
export function buildPurchaseJournalEntry (sourceData, { resolver }) {
  const { date, billNo = null, totals, roundOff = 0, amountPaid = 0 } = sourceData || {};
  if (!date) throw new TypeError('buildPurchaseJournalEntry: sourceData.date is required');
  if (!totals) throw new TypeError('buildPurchaseJournalEntry: sourceData.totals is required');

  const paid = Math.round((amountPaid || 0) * 100) / 100;
  const due = Math.round((totals.grand_total - paid) * 100) / 100;

  const lines = [];
  const addIfPositive = (role, side, amount) => {
    const rounded = Math.round((amount || 0) * 100) / 100;
    if (rounded <= 0) return;
    lines.push(amountLine(resolver.resolve(role), side, rounded));
  };

  addIfPositive(ACCOUNT_ROLES.PURCHASE_ACCOUNT, 'debit', totals.subtotal);
  addIfPositive(ACCOUNT_ROLES.INPUT_CGST_ACCOUNT, 'debit', totals.cgst_total);
  addIfPositive(ACCOUNT_ROLES.INPUT_SGST_ACCOUNT, 'debit', totals.sgst_total);
  addIfPositive(ACCOUNT_ROLES.INPUT_IGST_ACCOUNT, 'debit', totals.igst_total);
  addIfPositive(ACCOUNT_ROLES.INPUT_CESS_ACCOUNT, 'debit', totals.cess_total);
  addIfPositive(ACCOUNT_ROLES.CASH_ACCOUNT, 'credit', paid);
  addIfPositive(ACCOUNT_ROLES.ACCOUNTS_PAYABLE, 'credit', due);

  const roundOffLine = signedLine(
    roundOff !== 0 ? resolver.resolve(ACCOUNT_ROLES.ROUNDING_ACCOUNT) : null,
    'debit',
    roundOff
  );
  if (roundOffLine) lines.push(roundOffLine);

  return {
    date,
    // Hotfix (post-15C production readiness review): create_purchase()
    // coalesces a blank Bill Number to '' (sale_rpc.sql), not null -- '' is
    // not a valid JournalEntry.reference (createJournalEntry() throws for
    // any non-empty-string-or-null value). billNo's own `= null` default
    // only covers `undefined`, not an explicit ''.
    reference: billNo || null,
    narration: billNo ? `Purchase bill ${billNo}` : null,
    lines,
    metadata: {}
  };
}

export const purchasePostingProviderDefinition = createPostingProviderDefinition({
  id: 'purchasePostingProvider',
  name: 'Purchase',
  description: 'Posts a balanced journal entry for a purchase bill: net purchase cost and input GST against cash paid/accounts payable.',
  sourceModule: POSTING_SOURCES.PURCHASE,
  voucherTypes: [VOUCHER_TYPES.PURCHASE],
  buildJournalEntry: buildPurchaseJournalEntry
});

/** Idempotent -- see salesPostingProvider.js's own registration comment. */
export function registerPurchasePostingProvider () {
  if (!postingProviderRegistry.has(purchasePostingProviderDefinition.id)) {
    postingProviderRegistry.register(purchasePostingProviderDefinition);
  }
  return purchasePostingProviderDefinition;
}
