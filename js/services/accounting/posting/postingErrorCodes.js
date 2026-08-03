// posting/postingErrorCodes.js
// Pipeline-level outcome codes for AccountingPlatform.post()/reverse()
// (Milestone 15B). Deliberately separate from validation/journalEntryValidator.js's
// JOURNAL_ERROR_CODES, which stays about entry VALIDITY (is this a legal
// double-entry voucher). These codes are about pipeline OUTCOME (did
// posting a valid-or-invalid voucher succeed) -- the same "different
// questions get different mechanisms" split ADR-0011 already draws
// between contract-throw and validation-result. A VALIDATION_FAILED
// outcome carries JOURNAL_ERROR_CODES entries inside it; it does not
// replace them.

export const POSTING_ERROR_CODES = Object.freeze({
  /** No posting provider is registered for this voucherType. Config error, not user-facing. */
  PROVIDER_NOT_FOUND: 'PROVIDER_NOT_FOUND',
  /** More than one provider claims this voucherType -- postingProviderRegistry allows it, the façade does not resolve the ambiguity for you. */
  MULTIPLE_PROVIDERS_FOUND: 'MULTIPLE_PROVIDERS_FOUND',
  /** A role the provider needed had no configured account -- see resolution/accountResolutionContract.js. */
  ACCOUNT_RESOLUTION_FAILED: 'ACCOUNT_RESOLUTION_FAILED',
  /** validateJournalEntry()/assertBalancedJournalEntry() rejected the built entry -- see error.errors for JOURNAL_ERROR_CODES detail. */
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  /** The entry was valid but the RPC call failed (network, DB) after passing validation -- the source document is posted-but-unconfirmed from the caller's point of view. */
  PERSIST_FAILED: 'PERSIST_FAILED',
  /** reverse() only: the caller is not an owner/manager of the company (design decision #7). */
  NOT_AUTHORIZED: 'NOT_AUTHORIZED',
  /** reverse() only: no journal entry with that id exists for this company. */
  JOURNAL_NOT_FOUND: 'JOURNAL_NOT_FOUND'
});

/**
 * A single human-readable line for a failed AccountingPlatform.post()/reverse()
 * result -- Milestone 15B Blocker 3 (posting failure UX). One shared
 * formatter rather than three near-identical string-building call sites
 * in sale.html/purchase.html/manufacturing.html, so the wording (and any
 * future improvement to it) lives in one place.
 * @param {{success: boolean, errorCode?: string, errors?: object[]}|null|undefined} posting
 * @returns {string|null} null when posting is missing or already succeeded -- nothing to describe
 */
export function describePostingFailure (posting) {
  if (!posting || posting.success !== false) return null;
  const detail = posting.errors?.[0]?.message || 'no further detail available';
  return `${posting.errorCode || 'POSTING_FAILED'} -- ${detail}`;
}
