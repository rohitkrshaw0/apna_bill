# 0008. Accounting Money Representation — Integer Minor Units, No Balance Tolerance

Status: Accepted

## Context

Milestone 15A (Accounting Platform Foundation) needs a balanced-entry check: the sum of a
journal entry's debits must equal the sum of its credits. Money in this application is
2-decimal — every monetary column in `schema.sql` is `numeric(14,2)`, and `js/gst.js`'s
own `R(n, d = 2)` rounds every computed amount to 2 decimal places.

IEEE-754 doubles cannot represent most 2-decimal values exactly (`0.1 + 0.2 ===
0.30000000000000004`), so a naive `sumDebits === sumCredits` on rupee floats is unsound.
The obvious workaround — an epsilon tolerance — is worse, not better: a double-entry
validator that tolerates imbalance has stopped being a double-entry validator. This
repository already contains that exact failure mode, which this decision exists to not
repeat: `js/services/dataExchange/xml/validators/xmlBusinessRules.js` sums a Tally
ledger-entries block and checks `Math.abs(sum) > 0.5`, emitting a warning — a half-rupee
tolerance on what is, in effect, a double-entry check.

This decision is expensive to re-derive (the precision-window math below took real
analysis to get right) and forecloses the shape of every future consumer's arithmetic
(`js/services/accounting/shared/money.js`, and eventually a `journal_lines` schema), so it
warrants an ADR per this directory's own criteria.

## Decision

**Integer minor units (paise) are the canonical representation for every sum and
comparison in the Accounting Platform. The balance check is an exact integer `===`, with
no epsilon anywhere in the balance path.**

A rupee amount is converted to paise exactly once, at journal-line construction
(`toMinorUnits()` in `shared/money.js`), via `Math.round(amount * 100)`. Every downstream
sum (`sumMinorUnits()`) and comparison (`isBalanced()`) operates on these integers.

**Sub-paise precision is rejected at construction, never silently rounded.** Rounding is
the responsibility of whoever *computes* an amount (a future posting provider, using
`gst.js`'s own math); recording is this platform's job. Silently coercing `100.005` to
`100.01` would hide a caller's bug and could produce an entry whose two sides were each
independently rounded — the very drift a double-entry system exists to prevent.

**The "is this genuinely 2dp?" test is derived from float representation, not chosen as an
allowance for accounting error.** Testing `Number.isInteger(amount * 100)` directly is
unsound: `1.15 * 100 === 114.99999999999999`, so a perfectly legal rupee value would be
rejected. The actual test, in the scaled domain:

```js
const scaled = amount * 100;
const minor  = Math.round(scaled);
if (Math.abs(scaled - minor) > 1e-6) throw new TypeError(...);
```

`1e-6` in the scaled domain is `1e-8` rupees. A genuine 2-decimal value lands within
roughly `1e-10` of an integer after scaling (double relative error at these magnitudes,
~15–17 significant decimal digits). The smallest genuine sub-paise value, `0.001`, scales
to `0.1` — five orders of magnitude outside the window. The two cases — float noise vs.
real precision — are cleanly separated by this margin. `0.1 + 0.2` (`30.000000000000004`
scaled) is accepted as `30` paise; `0.005` (`0.5` scaled) is rejected.

**Convergence with, and one deliberate divergence from, `js/gst.js`.** `roundMoney()`
reuses `gst.js`'s own rounding math (`Math.round(n * 10^d) / 10^d`) so an amount computed
and rounded there never fails validation here. It diverges on null handling: `gst.js`'s
`R(null)` and `R(NaN)` return `0`, a forgiving default appropriate to tax-line math with
partial input. In a ledger, a `null` debit is a bug to surface, not a zero to record —
every function in `shared/money.js` throws on a non-finite input.

## Alternatives considered

**Float rupees with an epsilon tolerance** (e.g. `Math.abs(diff) < 0.005`). Rejected: this
is the `xmlBusinessRules.js` pattern this decision explicitly exists to not repeat. Any
nonzero tolerance means some genuinely unbalanced entry is accepted as balanced.

**A decimal/BigNumber library** (e.g. representing amounts as strings or a `Decimal` type
throughout). Rejected for this milestone: it would touch every contract's shape and every
future consumer, for a problem integer minor units already solve completely within this
application's fixed 2-decimal domain. `numeric(14,2)` never needs more than 2 decimal
places of precision, so paise-as-integers is sufficient and simpler than general-purpose
arbitrary-precision arithmetic.

**Round sub-paise input silently instead of rejecting it.** Rejected: see Decision above —
this would hide bugs in whatever produced the amount and risks two independently-rounded
sides of what looks like one balanced entry.

**A larger or business-chosen tolerance constant, documented as intentional.** Rejected:
any tolerance, however small and however well-documented, is a tolerance on imbalance. The
`1e-6` constant in this decision is not a tolerance on imbalance at all — the balance check
itself (`differenceMinor === 0`) has none. It is a float-noise threshold applied once, at
the point where a rupee number becomes an integer, and it separates representation noise
from real precision rather than permitting either.

## Consequences

- Every journal line frozen by `createJournalLine()` carries both a rupee view
  (`debit`/`credit`) and a canonical paise view (`debitMinor`/`creditMinor`), computed once
  and never re-derived, so they cannot drift.
- `validateJournalEntry()`'s `UNBALANCED` check (`differenceMinor !== 0`) is exact — no
  future contributor can "fix" an occasional false-unbalanced report by loosening it into a
  tolerance, because there is no tolerance to loosen.
- A future posting provider that computes amounts via `gst.js` will never see a spurious
  `toMinorUnits()` rejection for a value `gst.js` itself considers correctly rounded.
- A future consumer that needs sub-paise precision (there is no known one) would require a
  new decision, not a quiet widening of this module's tolerance.
- `numeric(14,2)`'s ceiling (`999999999999.99`) is enforced in `toMinorUnits()`; a future
  schema change to a larger precision would need this constant updated in step.

## References

- `js/gst.js` — the repository's only prior money math; `roundMoney()` converges on its
  rounding, diverges on its null-handling
- `js/services/dataExchange/xml/validators/xmlBusinessRules.js` — the 0.5-rupee-tolerance
  counter-example this decision explicitly rejects
- `js/services/accounting/shared/money.js` — the implementation
- `docs/architecture/accounting-platform-architecture.md` §4 — the architecture reference
  for this decision
