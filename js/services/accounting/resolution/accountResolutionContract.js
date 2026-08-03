// resolution/accountResolutionContract.js
// The Account Resolution Service's vocabulary (Milestone 15B design
// decision #6). A posting provider never reads accounting_settings or the
// chart of accounts directly -- it asks the resolver for a named business
// ROLE and gets back an accountId. This file names the roles 15B's own
// three automatic posting providers need and the error codes a failed
// resolution reports; the service itself (accountResolutionService.js) is
// what actually looks anything up.
//
// ---------------------------------------------------------------------
// OPEN CATALOG, LIKE POSTING_SOURCES -- NOT LIKE NORMAL_BALANCES
// ---------------------------------------------------------------------
// ACCOUNT_ROLES is a non-exhaustive convenience catalog, not a closed
// enum: a future posting provider (GST returns, payments, a manual
// journal's own party picker) will need role names this milestone cannot
// name yet. resolve() accepts any non-empty string role, exactly the way
// journalContract.js's postingSource/voucherType do.

/** Well-known account roles 15B's Sales/Purchase/Manufacturing providers resolve. */
export const ACCOUNT_ROLES = Object.freeze({
  SALES_ACCOUNT: 'salesAccount',
  PURCHASE_ACCOUNT: 'purchaseAccount',
  CASH_ACCOUNT: 'cashAccount',
  ACCOUNTS_RECEIVABLE: 'accountsReceivableAccount',
  ACCOUNTS_PAYABLE: 'accountsPayableAccount',
  OUTPUT_CGST_ACCOUNT: 'outputCgstAccount',
  OUTPUT_SGST_ACCOUNT: 'outputSgstAccount',
  OUTPUT_IGST_ACCOUNT: 'outputIgstAccount',
  OUTPUT_CESS_ACCOUNT: 'outputCessAccount',
  INPUT_CGST_ACCOUNT: 'inputCgstAccount',
  INPUT_SGST_ACCOUNT: 'inputSgstAccount',
  INPUT_IGST_ACCOUNT: 'inputIgstAccount',
  INPUT_CESS_ACCOUNT: 'inputCessAccount',
  ROUNDING_ACCOUNT: 'roundingAccount',
  INVENTORY_ACCOUNT: 'inventoryAccount',
  MANUFACTURING_OVERHEAD_ACCOUNT: 'manufacturingOverheadAccount'
});

export const RESOLUTION_ERROR_CODES = Object.freeze({
  NOT_LOADED: 'NOT_LOADED',
  ACCOUNT_NOT_CONFIGURED: 'ACCOUNT_NOT_CONFIGURED',
  ACCOUNT_NOT_FOUND: 'ACCOUNT_NOT_FOUND',
  ACCOUNT_INACTIVE: 'ACCOUNT_INACTIVE'
});

/**
 * Thrown by accountResolutionService.resolve() -- a programmer/config
 * error (a company has not finished chart-of-accounts setup), the same
 * "throw on malformed input" stance every contract in this platform
 * already takes (ADR-0011), not ordinary user input to collect into a
 * { isValid, errors } result.
 */
export class AccountResolutionError extends Error {
  /**
   * @param {string} code one of RESOLUTION_ERROR_CODES
   * @param {string} role the role that failed to resolve
   */
  constructor (code, role) {
    super(`AccountResolutionError: role "${role}" could not be resolved (${code})`);
    this.name = 'AccountResolutionError';
    this.code = code;
    this.role = role;
  }
}
