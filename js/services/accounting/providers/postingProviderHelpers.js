// providers/postingProviderHelpers.js
// Small, shared helpers for building journal lines inside a
// buildJournalEntry() implementation (Milestone 15B). Not part of the
// platform's public surface (index.js does not re-export this file) --
// it exists so Sales/Purchase/Manufacturing don't each reinvent "skip a
// zero amount" and "a rounding adjustment's side depends on its sign."

/**
 * A plain debit-or-credit line, or null when the amount rounds to exactly
 * zero -- callers filter the result out rather than emit a LINE_SIDE_MISSING
 * line the validator would reject anyway. Amount must be >= 0: this is for
 * ordinary lines (a tax total, a payment amount), never a signed adjustment
 * -- see signedLine() below for that.
 * @param {string} accountId
 * @param {'debit'|'credit'} side
 * @param {number} amount rupees, >= 0
 * @param {object} [extra] narration/metadata to spread onto the line
 */
export function amountLine (accountId, side, amount, extra = {}) {
  const rounded = Math.round(amount * 100) / 100;
  if (rounded <= 0) return null;
  return {
    accountId,
    debit: side === 'debit' ? rounded : 0,
    credit: side === 'credit' ? rounded : 0,
    ...extra
  };
}

/**
 * A rounding-style adjustment whose SIGN, not just its magnitude, decides
 * which side it lands on -- unlike every other line in a Sales/Purchase
 * entry, round_off can legitimately be negative. `positiveSide` is which
 * side a positive amount uses; a negative amount flips to the other side
 * with its absolute value. Returns null when the amount rounds to exactly
 * zero (no rounding adjustment needed -- the common case).
 * @param {string} accountId
 * @param {'debit'|'credit'} positiveSide
 * @param {number} amount rupees, any sign
 * @param {object} [extra]
 */
export function signedLine (accountId, positiveSide, amount, extra = {}) {
  const rounded = Math.round(amount * 100) / 100;
  if (rounded === 0) return null;
  const oppositeSide = positiveSide === 'debit' ? 'credit' : 'debit';
  const side = rounded > 0 ? positiveSide : oppositeSide;
  return amountLine(accountId, side, Math.abs(rounded), extra);
}
