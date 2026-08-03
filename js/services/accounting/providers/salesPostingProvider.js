// providers/salesPostingProvider.js
// The Sales automatic posting provider (Milestone 15B). Registered onto
// the shared postingProviderRegistry singleton (index.js) so
// AccountingPlatform.post({ voucherType: 'sales', ... }) can find it --
// nothing outside this file ever calls buildJournalEntry() directly.
//
// sourceData shape (built by sales.js after create_sale succeeds --
// see the transaction-flow audit behind the Milestone 15B design review:
// create_sale's own RPC response carries no money, the caller already
// holds every figure it needs before calling the RPC at all):
//   { date, invoiceNo, totals: { subtotal, discount_total, cgst_total,
//     sgst_total, igst_total, cess_total, grand_total }, roundOff,
//     amountPaid }
//
// ---------------------------------------------------------------------
// WHY THERE IS NO SEPARATE "DISCOUNT ALLOWED" LINE
// ---------------------------------------------------------------------
// gst.js's computeLine() already nets discount_amt out of taxable_value
// before totals.subtotal ever sums it -- discount_total is informational
// only. Recording revenue net of discount (rather than gross revenue plus
// a separate discount expense) is a legitimate, simpler bookkeeping
// choice for the data this ERP actually captures, not an omission.
//
// ---------------------------------------------------------------------
// WHY THE ROUNDING LINE'S ACCOUNT IS ONLY RESOLVED WHEN NEEDED
// ---------------------------------------------------------------------
// roundOff is 0 on the large majority of invoices (buildInvoiceMath's
// default 'nearest' mode rounds to the nearest rupee, so most totals
// already land on an integer). Resolving ROUNDING_ACCOUNT unconditionally
// would force every company to configure it even if they never see a
// non-zero round_off; resolving it only when roundOff !== 0 means the
// requirement only bites when it is genuinely needed.

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
export function buildSalesJournalEntry (sourceData, { resolver }) {
  const { date, invoiceNo = null, totals, roundOff = 0, amountPaid = 0 } = sourceData || {};
  if (!date) throw new TypeError('buildSalesJournalEntry: sourceData.date is required');
  if (!totals) throw new TypeError('buildSalesJournalEntry: sourceData.totals is required');

  const paid = Math.round((amountPaid || 0) * 100) / 100;
  const due = Math.round((totals.grand_total - paid) * 100) / 100;

  const lines = [];
  const addIfPositive = (role, side, amount) => {
    const rounded = Math.round((amount || 0) * 100) / 100;
    if (rounded <= 0) return;
    lines.push(amountLine(resolver.resolve(role), side, rounded));
  };

  addIfPositive(ACCOUNT_ROLES.CASH_ACCOUNT, 'debit', paid);
  addIfPositive(ACCOUNT_ROLES.ACCOUNTS_RECEIVABLE, 'debit', due);
  addIfPositive(ACCOUNT_ROLES.SALES_ACCOUNT, 'credit', totals.subtotal);
  addIfPositive(ACCOUNT_ROLES.OUTPUT_CGST_ACCOUNT, 'credit', totals.cgst_total);
  addIfPositive(ACCOUNT_ROLES.OUTPUT_SGST_ACCOUNT, 'credit', totals.sgst_total);
  addIfPositive(ACCOUNT_ROLES.OUTPUT_IGST_ACCOUNT, 'credit', totals.igst_total);
  addIfPositive(ACCOUNT_ROLES.OUTPUT_CESS_ACCOUNT, 'credit', totals.cess_total);

  const roundOffLine = signedLine(
    roundOff !== 0 ? resolver.resolve(ACCOUNT_ROLES.ROUNDING_ACCOUNT) : null,
    'credit',
    roundOff
  );
  if (roundOffLine) lines.push(roundOffLine);

  return {
    date,
    reference: invoiceNo,
    narration: invoiceNo ? `Sales invoice ${invoiceNo}` : null,
    lines,
    metadata: {}
  };
}

export const salesPostingProviderDefinition = createPostingProviderDefinition({
  id: 'salesPostingProvider',
  name: 'Sales',
  description: 'Posts a balanced journal entry for a sales invoice: cash/receivable against net sales revenue and output GST.',
  sourceModule: POSTING_SOURCES.SALES,
  voucherTypes: [VOUCHER_TYPES.SALES],
  buildJournalEntry: buildSalesJournalEntry
});

/** Idempotent -- safe to call from more than one module-load path (see reporting's own registerXReport() precedent). */
export function registerSalesPostingProvider () {
  if (!postingProviderRegistry.has(salesPostingProviderDefinition.id)) {
    postingProviderRegistry.register(salesPostingProviderDefinition);
  }
  return salesPostingProviderDefinition;
}
