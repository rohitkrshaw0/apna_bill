# 0014. Profit & Loss Account Classification — Closed Inclusion List, No Silent Default

Status: Accepted

## Context

Milestone 15G (Profit & Loss) needs to answer a question Trial Balance (15F) never had
to: *which* accounts belong on the statement, not just what each one's balance is. Trial
Balance deliberately includes every account in the chart regardless of category (see its
own doc comment in `js/trialBalanceData.js`) — a formal trial balance is complete by
definition. A Profit & Loss statement is not: it is Revenue and Expenses only, to the
deliberate exclusion of Assets, Liabilities, Equity, and every other Balance Sheet
category.

`accounts.category` is an **open catalog** (ADR-0010) — validated as a non-empty string,
never membership-checked, specifically so a future company or extension can introduce a
category this codebase never anticipated. ADR-0010 already established the governing
precedent for exactly this shape of problem, for a different derived fact
(`normalBalance`): pair the open catalog with a **closed derivation table** over a named
subset of it, and require any category the table doesn't recognize to be handled
explicitly rather than defaulted. `gst`, `suspense`, and `control` are absent from
`NORMAL_BALANCE_BY_CATEGORY` on purpose, for the same reason: each can genuinely go
either way, and a forced default would be silently wrong for roughly half of real
accounts in that category.

P&L inclusion is the same shape of problem, not a new one. `income` and `expenses` /
`directExpenses` / `indirectExpenses` are unambiguous — every account seeded into these
categories (`schema.sql` §23's default chart: `4000 Sales` → `income`, `5000 Purchases`
→ `directExpenses`, `5900 Manufacturing Overhead` → `indirectExpenses`) is a P&L account
in standard practice, full stop. Every other category in the closed 17-value set
(`ACCOUNT_CATEGORIES`, `js/services/accounting/contracts/accountContract.js`) —
`assets`, `currentAssets`, `fixedAssets`, `liabilities`, `currentLiabilities`, `equity`,
`bank`, `cash`, `receivable`, `payable`, `gst`, `suspense`, `control` — is unambiguously
*not* a P&L category: each one names a Balance Sheet position, or a genuinely unresolved
clearing/control bucket whose contents are by definition awaiting reclassification and so
cannot be recognised in any period's profit. There is no category, closed or custom, for
which "is this a P&L category" is genuinely ambiguous the way `normalBalance` is for
`gst`/`suspense`/`control` — which is exactly why this ADR can commit to a closed
inclusion list rather than needing an escape hatch for declared-explicit ambiguity.

A distinction this ADR originally blurred, and states explicitly here because Milestone
15G's own production-readiness review turned it up as a live defect: *the category being
correctly excluded is a separate question from every account inside it being correctly
categorised.* An account whose economic meaning is a P&L one but which has been seeded
into an excluded category is an **Accounting Foundation defect in the chart of accounts**,
not evidence that the excluded category belongs on the statement. It is fixed by
recategorising that account at its seed, never by admitting its category to the inclusion
list and never by naming the account inside P&L composition. See the Rounding Off
subsection under Decision for the one real instance of this.

This decision also directly shapes the next milestone. `docs/architecture/
accounting-platform-architecture.md` §16 already names Balance Sheet as 15G's own
successor, composing on the same `v_journal_ledger_lines`/`balanceAt()` surface. Without
a recorded inclusion boundary, Balance Sheet's own scoping would have to re-derive "which
accounts are mine" from scratch, or worse, silently invert P&L's own list and inherit any
mistake in it. Recording the boundary once, here, makes Balance Sheet's own scoping a
citation, not a re-derivation.

## Decision

**Profit & Loss includes accounts in exactly four categories — `income`,
`directExpenses`, `indirectExpenses`, and the generic `expenses` — and no others. Every
other category, closed or custom, is excluded from the statement.**

```
P&L INCLUDED (closed list):
  income            -> Revenue section
  directExpenses    -> Cost of Goods Sold / Direct Expenses section (nets against
                        Revenue for Gross Profit)
  indirectExpenses  -> Operating Expenses section (nets against Gross Profit for
                        Net Profit)
  expenses          -> folded into the Operating Expenses section alongside
                        indirectExpenses -- this generic category exists in the open
                        catalog for an account that is an expense without a
                        direct/indirect split having been made yet; treating it as
                        indirect is the same "expenses, by default, are operating
                        expenses" convention most accounting software uses, and it is
                        the only one of the four that is a genuine judgment call, not
                        a resolved ambiguity (see Alternatives)

P&L EXCLUDED (closed list, unambiguous Balance Sheet or clearing categories):
  assets, currentAssets, fixedAssets, liabilities, currentLiabilities, equity,
  bank, cash, receivable, payable, gst, suspense, control

P&L EXCLUDED (default, not a silent guess):
  any category absent from BOTH lists above -- a future custom category, or a
  future addition to ACCOUNT_CATEGORIES this ADR did not anticipate
```

**An account whose category is not one of the four included categories is excluded from
the statement — never included by a default guess, and never a thrown error either.**
Unlike `deriveNormalBalance()` (ADR-0010), which throws when a category is genuinely
ambiguous and the caller supplied no explicit override, P&L classification has no
"explicit override" input to fall back on — an account's category is what it is, set at
Chart of Accounts registration, not something a P&L rendering pass can ask the caller to
clarify per-account. So the closed list is exhaustive by construction (inclusion is a
membership test against exactly four known values, not a derivation with named gaps),
and "not in the list" is a well-defined, silent exclusion, not a missing case. This is a
deliberate difference from ADR-0010's throw-on-ambiguity posture, not an inconsistency
with it: ADR-0010 throws because silently guessing a *derived accounting fact*
(normalBalance) risks posting or displaying a number wrong-signed; excluding a Balance
Sheet account from a Revenue/Expense statement is not a guess at any fact — it is the
statement working exactly as designed. A future contributor who adds a genuinely new
income-statement category (e.g. splitting `expenses` into a named subcategory) must add
it to the included list explicitly here — this ADR, not silent inference from the
category string, is what P&L composition may cite as authority for its inclusion set.

The account category (`accounts.category`) remains the single, authoritative
classification source for this decision. No second, parallel account-categorization
system is introduced — P&L composition reads `category` off the same `accounts` rows
Trial Balance and General Ledger already query, through the same `getAccountById()`-style
shape, and asks nothing else of the schema.

### Account 9000 "Rounding Off" is classified `indirectExpenses`

**Account 9000 `Rounding Off` — the account `bootstrap_accounting_defaults()`
(`schema.sql` §23) seeds for the `roundingAccount` role — is categorised
`indirectExpenses`, and therefore appears on the Profit & Loss statement in the Operating
Expenses section.** It was originally seeded as `suspense`; that was an error in the
seeded chart of accounts, corrected in Milestone 15G.

The reasoning is the general rule above applied to its one real instance. Both production
posting paths that write to this account — `salesPostingProvider.js` (credits it when
`round_off > 0`) and `purchasePostingProvider.js` (debits it when `round_off > 0`) — post
a **realised gain or loss on a completed transaction**, computed as
`grand_total - preRound` by `buildInvoiceMath()` (`js/gst.js`). Nothing about that amount
is unidentified or awaiting reclassification, and nothing in this codebase ever clears
it: there is no clearing RPC, no period-end routine, and no reclassification path. An
amount that is realised at the moment it is posted and is never cleared is not a suspense
item; it is an operating expense (or, when it nets favourably, a reduction of one). This
also matches standard Indian practice, where Round Off is an indirect expense.

Three properties make `indirectExpenses` the correct existing category rather than a
convenient one:

- It is already in `ACCOUNT_CATEGORIES` and already in this ADR's inclusion list. **No new
  category is invented, and the closed inclusion list is not widened** — it still contains
  exactly the four categories named above.
- Its derived normal balance (`NORMAL_BALANCE_BY_CATEGORY`, ADR-0010) is `debit`, which
  matches account 9000's seeded `normal_balance` unchanged. The account therefore does not
  become a contra account, and `isContraAccount()` continues to return false for it.
- A net rounding **gain** is handled correctly with no extra logic: the account's signed
  period movement simply goes negative, `bucketSignedBalance()` reports it on the credit
  side, and the Operating Expenses subtotal is reduced accordingly.

**This is not a special-case treatment, and no second classification system exists.**
`js/profitLossData.js` contains no reference to account 9000, to its code, to its name, or
to the `roundingAccount` role, and this decision introduces none. P&L composition still
performs exactly one test — is this account's `category` one of the four included
categories — and account 9000 now satisfies it the same way accounts 5900 and any future
indirect-expense account do. The fix lives entirely in the account's own data.

**The generic `suspense` category remains excluded from Profit & Loss.** This subsection
recategorises one account; it does not admit `suspense` to the inclusion list, and a
genuine suspense account — one holding an amount whose correct home really is not yet
known — must continue to be excluded, because recognising an unresolved balance in profit
is exactly the error the exclusion exists to prevent. After this correction no seeded
account uses the `suspense` category at all.

## Alternatives considered

**Add a P&L-inclusion flag to `accounts` (schema change).** Rejected: 15F's own scope
discipline ("no schema object of any kind") is the standard this milestone follows too —
the existing `category` column already carries this information unambiguously for three
of the four included categories, and a new column would duplicate a fact the chart of
accounts already states.

**Treat `expenses` as excluded, requiring every expense account to declare
`directExpenses`/`indirectExpenses` explicitly.** Rejected: `schema.sql`'s own seed data
and `ACCOUNT_CATEGORIES` both keep `expenses` as a live, generic category (not a
deprecated one) — excluding it from the statement would make an accurately-posted expense
account silently vanish from Net Profit, which is a materially wrong statement, not a
conservative one.

**Fold `expenses` into Direct Expenses instead of Indirect.** Rejected: an
undifferentiated "expense" is far more often an operating cost (rent, salaries,
utilities) than a cost directly attributable to producing revenue; defaulting to indirect
matches the common case and the convention most double-entry software already uses.

**Include account 9000 in P&L by naming it (its id, code, or `roundingAccount` role)
inside `js/profitLossData.js`.** Rejected outright: that is a second, parallel
classification system living in one consumer, exactly what this ADR's final Decision
paragraph forbids. It would also leave the chart of accounts still stating something
false about the account, so Trial Balance, Balance Sheet, and every future ledger-derived
screen would each have to reproduce the same exception to stay consistent.

**Admit the whole `suspense` category to the inclusion list so account 9000 comes with
it.** Rejected: this widens the closed list to fix one account, and it is wrong on the
merits — a genuine suspense balance is unresolved by definition and must not be
recognised in profit. The defect was one account sitting in the wrong category, not the
category being excluded.

**Give every unrecognized category a forced default (e.g., treat any unknown category as
excluded from Revenue, included in Expenses) instead of a closed inclusion list.**
Rejected: this is exactly the failure mode ADR-0010 already rejected for
`normalBalance` — a forced default is silently wrong for whatever the next custom
category turns out to be, and "wrong" here means an unrelated Balance Sheet account
(e.g. a future custom `deferredRevenue` liability category) polluting Net Profit.

## Consequences

- P&L composition (`js/profitLossData.js`) filters the chart of accounts to exactly the
  four included categories before calling `balanceAt()` twice per account (period-start
  and period-end) — no new schema, no new RPC, the same "compose on `balanceAt()`" rule
  ADR-0012/ADR-0013 already established for every ledger-derived screen.
- Balance Sheet (the next explicitly-deferred milestone per `accounting-platform-
  architecture.md` §16) can cite this ADR's excluded list directly for its own included
  set, rather than re-deriving which categories are Balance Sheet categories from
  scratch.
- A future custom category is excluded from P&L by default, not by a guess — visible and
  correct on day one, with no code change required for it to keep behaving that way. Only
  broadening the *included* list is a decision this ADR requires a future contributor to
  make explicitly, by name, here or in a superseding ADR.
- `expenses` folding into Operating Expenses (not a separate P&L section) is the one
  judgment call in this decision, not a resolved ambiguity like the other three included
  categories — a future milestone that wants generic `expenses` broken out by nature
  (e.g. a dedicated "Unclassified Expenses" section) supersedes this ADR rather than
  silently changing `js/profitLossData.js`'s own inclusion table.
- Rounding gains and losses reach Net Profit, through the ordinary `indirectExpenses`
  path and no other mechanism. The seeded chart of accounts changes by one string
  (`schema.sql` §23, account 9000's `category`); `js/profitLossData.js` does not change at
  all. Because `bootstrap_accounting_defaults()` inserts `ON CONFLICT DO NOTHING`, already
  provisioned companies do not pick this up from the seed and required a one-time
  backfill of their single account-9000 row — performed in Milestone 15G through the
  existing `accounts_update` RLS policy, with no migration file, RPC, or other new
  database artifact introduced.
- No seeded account uses the `suspense` category any more. The category itself remains in
  `ACCOUNT_CATEGORIES` and remains excluded from P&L, so a future genuinely-unresolved
  account still has a correct home that stays off the income statement.
- Balance Sheet (15H), which this ADR invites to cite the excluded list as its own
  included set, inherits a list that no longer misroutes realised gains and losses onto
  the Balance Sheet, where they could never have been cleared or recognised.

## References

- `docs/architecture/ADR/0010-account-open-catalog-closed-derivation.md` — the open
  catalog / closed derivation precedent this decision extends
- `docs/architecture/ADR/0012-ledger-view-as-canonical-running-balance-projection.md`,
  `docs/architecture/ADR/0013-trial-balance-bounded-fanout-over-ledger-view.md` — the
  `balanceAt()` composition pattern P&L reuses unchanged
- `js/services/accounting/contracts/accountContract.js` — `ACCOUNT_CATEGORIES`, the
  closed 17-value set this decision partitions
- `schema.sql` §23 — the default chart of accounts, whose `income`/`directExpenses`/
  `indirectExpenses` seed rows are the unambiguous worked examples this decision is
  built on, and where account 9000's own `category` is stated
- `js/services/accounting/providers/salesPostingProvider.js`,
  `js/services/accounting/providers/purchasePostingProvider.js` — the only two production
  paths that post to account 9000, and the evidence that what they post is a realised
  gain or loss rather than an unresolved balance
- `js/gst.js` — `buildInvoiceMath()`, where `round_off` is computed as
  `grand_total - preRound`
