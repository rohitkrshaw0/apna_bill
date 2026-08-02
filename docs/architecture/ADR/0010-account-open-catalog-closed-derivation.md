# 0010. Account Category/Type Catalogs Stay Open; Normal-Balance Derivation Stays Closed

Status: Accepted

## Context

`js/services/reporting/contracts/reportContract.js` already established a precedent this
codebase follows for open-ended taxonomies: `category` and `dataSource` are validated as
non-empty strings, not enum membership, because "future report categories are expected to
grow beyond what this milestone can name." Milestone 15A's Account Contract
(`js/services/accounting/contracts/accountContract.js`) needs the same openness for
`ACCOUNT_CATEGORIES` and `ACCOUNT_TYPES` — a Chart of Accounts is exactly the kind of thing
a future company or extension needs to extend with a category this milestone did not
anticipate.

But accounting has a constraint reporting's `category` never had: a *derived* fact depends
on it. Every account has a normal balance (debit or credit), and that normal balance is
mechanically determined by the account's category in standard double-entry practice
(Assets and Expenses are debit-normal; Liabilities, Equity, and Income are credit-normal).
A fully open category set with no derivation logic would make normal-balance derivation
impossible for any category value the derivation table doesn't happen to know about — which
is every custom category by definition, and even includes three categories *in this
milestone's own catalog* (GST, Suspense, Control) that have no single correct answer.

This is a genuinely new pattern (an open catalog paired with a closed derivation over a
subset of it) and needs its own record, both because it would be expensive to re-derive and
because a future contributor is likely to look at the derivation table's missing `gst`
entry and assume it's a bug.

## Decision

**`ACCOUNT_CATEGORIES` and `ACCOUNT_TYPES` remain open catalogs — validated as non-empty
strings, never membership-checked — extending reporting's own precedent. The
`normalBalance`-derivation table underneath them is closed. An account whose category is
absent from that table, or whose category's default is ambiguous, must declare
`normalBalance` explicitly; if it does not, construction throws.**

Concretely, in `deriveNormalBalance(category)`:

```
assets, currentAssets, fixedAssets, bank, cash, receivable,
expenses, directExpenses, indirectExpenses          -> debit
liabilities, currentLiabilities, equity, income, payable -> credit
gst, suspense, control, and any custom category      -> null (no default)
```

**`gst`, `suspense`, and `control` are deliberately absent from the table — this is not an
omission to "complete."** Input GST is an asset (debit-normal); Output GST is a liability
(credit-normal); the category "gst" alone does not determine which. The same ambiguity
applies to Suspense (a clearing account that can run either way depending on what it is
temporarily holding) and Control (an aggregate whose nature depends on what it controls).
Their absence is what makes the "must declare when ambiguous" rule exercised and tested
from the very first milestone, against three concrete, real cases, rather than existing
only as an untested provision for hypothetical future categories.

`NORMAL_BALANCES` (`debit`/`credit`) itself, unlike the category/type catalogs, **is**
membership-enforced when an explicit value is supplied. It is closed by the nature of
double-entry bookkeeping — an entry has exactly two sides, and there will never be a third
— which is a different kind of closure than a taxonomy that is merely incomplete today.

**Declared normal balance is permitted to disagree with the derived default — this is not
an error, and no consistency check exists to reject it.** A contra account is a standard,
correct accounting construct: Accumulated Depreciation is categorized `fixedAssets` (an
asset, derived debit-normal) but is itself credit-normal; Sales Returns is categorized
`income` (derived credit-normal) but is itself debit-normal. `isContraAccount(definition)`
exposes this distinction (`derived !== null && derived !== definition.normalBalance`) so
the permissiveness is visibly a decision, not a gap a future reviewer "fixes" by adding an
agreement check that would then incorrectly reject every contra account in the chart.

## Alternatives considered

**Close the category catalog to a fixed enum**, so every value is guaranteed to have a
known derivation. Rejected: this directly contradicts the open-taxonomy precedent already
established for reports, and a Chart of Accounts is precisely the kind of structure real
companies extend with categories (industry-specific control accounts, statutory categories)
no milestone can enumerate up front.

**Give every category a forced default, including `gst`/`suspense`/`control`** (e.g.
default all three to credit, matching a typical liability-heavy reading), so
`normalBalance` is always optional. Rejected: this would be actively wrong for roughly half
of real accounts in those categories (Input GST, an asset, would be forced into a
credit-normal default that every consumer would then need to know to override), which is
worse than requiring an explicit declaration.

**Enforce that a declared `normalBalance` must agree with the derived default when one
exists**, rejecting disagreement as an error. Rejected: this would make contra accounts —
a standard, necessary accounting construct — impossible to register, which is a functional
regression relative to not validating the relationship at all.

## Consequences

- A future account in a category not yet in the derivation table (a custom category from a
  future extension, or an industry-specific control account) always works: it simply must
  declare `normalBalance`. No contract change is required to add support for it.
- `gst`/`suspense`/`control` accounts always require an explicit `normalBalance` at
  registration — this is enforced, tested, and will not silently start "working" if someone
  adds a default to the table later without checking whether that default is actually
  always correct.
- Contra accounts (Accumulated Depreciation, Sales Returns, and similar) register cleanly,
  and `isContraAccount()` gives a future ledger/trial-balance screen a way to render them
  distinctly if it chooses to.
- A future contributor extending `NORMAL_BALANCE_BY_CATEGORY` should read this ADR first,
  to confirm any category they are tempted to add actually has one universally correct
  normal balance before adding it — `gst`/`suspense`/`control`'s absence is the worked
  counter-example.

## References

- `js/services/accounting/contracts/accountContract.js` — the implementation
  (`NORMAL_BALANCE_BY_CATEGORY`, `deriveNormalBalance`, `isContraAccount`)
- `js/services/reporting/contracts/reportContract.js` — the open-catalog precedent this
  decision extends
- `docs/architecture/accounting-platform-architecture.md` §5 — the architecture reference
