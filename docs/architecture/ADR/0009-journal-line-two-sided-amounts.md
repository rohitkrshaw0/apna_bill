# 0009. Journal Line Shape — Two Non-Negative Amount Fields, Not One Signed Amount

Status: Accepted

## Context

Milestone 15A's Journal Contract (`js/services/accounting/contracts/journalContract.js`)
needs to represent a journal line's amount. Two shapes were on the table: a single signed
`amount` field (positive for debit, negative for credit, or vice versa), or two
non-negative fields, `debit` and `credit`.

This is a foreclosing decision: it fixes the eventual `journal_lines` table's column shape
and every downstream consumer's arithmetic (a future ledger screen, trial balance, GST
return, and the Tally exporter would all inherit whichever representation is chosen here).
It is also a documented deviation from prior art already in this repository — the existing
signed-amount pattern in `dataExchange/xml/mapping/vouchers/salesVoucherMapper.js` — so it
warrants a record per this directory's own "deviates from an established convention"
criterion.

## Decision

**A `JournalLine` carries two non-negative fields, `debit` and `credit`, each defaulting
to `0` (never `null`), with an exactly-one-side-positive invariant enforced by
`validation/journalEntryValidator.js` (not by the contract factory itself — see
`docs/architecture/ADR/0011-accounting-validation-throw-vs-result.md`).**

Reasons, in order of weight:

1. **A signed amount cannot distinguish "no side chosen" from "zero."** With a signed
   `amount: 0`, a line a caller forgot to fill in is silently legal and silently balanced.
   With two fields, "neither side filled" is a detectable, nameable error
   (`LINE_SIDE_MISSING`). A representation that makes one entire class of malformed input
   undetectable defeats the purpose of building a validator at all.
2. **The sign convention becomes tribal knowledge.** Is positive a debit or a credit? Every
   future consumer — a ledger register, a trial balance, a GST return, the Tally exporter —
   would have to independently know and agree. Two named fields carry the answer in the
   field name; there is nothing to memorize or get backwards.
3. **It maps directly onto the eventual persistence shape and lets Postgres enforce the
   same invariant the JS validator enforces**: `check ((debit = 0) <> (credit = 0)), check
   (debit >= 0 and credit >= 0)`. `schema.sql` already uses this exact `<>`-as-XOR idiom on
   `invoice_attachments` (`check ((invoice_id is not null) <> (purchase_id is not null))`).
   A signed column would need either a separate `side` column or would have no natural
   database-level check at all.
4. **This repository's own signed-amount experiment is the cautionary tale.**
   `salesVoucherMapper.js`'s `sumLedgerEntries()` sums Tally's signed `LEDGERENTRIES`
   amounts into one figure (`meta.ledgerEntriesSum`), and the cross-check over that figure
   (`xmlBusinessRules.js`) degraded into a `Math.abs(sum) > 0.5` warning rather than a hard
   balance requirement — see ADR-0008. A signed representation did not, in practice, keep
   this codebase honest about balance.

`0`, not `null`, for the unused side: sums need no null guards (`debitMinor + creditMinor`
is always well-defined), it matches the future `not null default 0` column, and `null`
would introduce a third state ("not applicable") that buys nothing over `0`.

**Negative amounts are rejected outright** by `toMinorUnits()` at construction (ADR-0008).
A negative debit is a credit; permitting one would let a line assert nonsense that happens
to arithmetically cancel. Indian accounting practice expresses contra movement by posting
to the opposite side, never by a negative amount on the original side.

**Each line stores both a rupee view and a minor-unit view, computed once and frozen**
(`debit`/`credit` and `debitMinor`/`creditMinor`). This looks redundant but is deliberate:
it guarantees the two representations can never drift apart, and it means no validator or
future consumer re-derives paise with a rounding rule that might differ from the one used
at construction.

## Alternatives considered

**One signed `amount` field, with a separate `side` enum (`'debit' | 'credit'`).**
Rejected: this is functionally the two-field shape with extra indirection — a consumer
still has to branch on `side` to know which total to add the amount to, and it does not
gain anything a plain `debit`/`credit` pair doesn't already have, while adding a third
field to validate.

**One signed `amount` field alone, with a repository-wide convention (e.g. "positive is
always debit").** Rejected: see Decision point 1 — a signed zero cannot represent "not
filled in," which is exactly the malformation this platform's validator (ADR-0011) exists
to catch. The convention would also need to be independently known by every future
consumer with no way to check it was applied correctly at any single call site.

**Match `dataExchange`'s existing signed-sum convention for consistency with the rest of
the codebase.** Rejected: that convention exists inside a Tally *interop* boundary
(translating an external, already-signed wire format), not inside a system whose job is to
originate correct double-entry records. Importing its shape here would import its known
weakness (ADR-0008's counter-example) into the part of the codebase meant to prevent it.

## Consequences

- The eventual `journal_lines` table (Milestone 15B+) has a natural, enforceable schema:
  `debit numeric(14,2) not null default 0, credit numeric(14,2) not null default 0, check
  ((debit = 0) <> (credit = 0)), check (debit >= 0 and credit >= 0))` — no additional
  design work needed when that table is created.
  the platform.
- Every future consumer of a `JournalLine` (ledger display, trial balance, exports) reads
  `debit`/`credit` directly with no sign-convention lookup required.
- `findLineSideErrors()` in `validation/journalEntryValidator.js` can classify exactly three
  failure modes per line (`LINE_SIDE_MISSING`, `LINE_SIDE_BOTH`, `NEGATIVE_AMOUNT`) that a
  signed representation could not distinguish as cleanly.
- A future contributor proposing a signed-amount refactor for "simplicity" should read this
  ADR first — the two-field shape is a considered decision, not an unexamined default.

## References

- `js/services/accounting/contracts/journalContract.js` — the implementation
- `docs/architecture/ADR/0008-accounting-money-integer-minor-units.md` — the paise
  representation each side's amount converts to
- `js/services/dataExchange/xml/mapping/vouchers/salesVoucherMapper.js` — the signed-sum
  precedent this ADR deviates from, and why
- `schema.sql` (`invoice_attachments`) — the existing `<>`-as-XOR check idiom this
  decision's future schema will reuse
