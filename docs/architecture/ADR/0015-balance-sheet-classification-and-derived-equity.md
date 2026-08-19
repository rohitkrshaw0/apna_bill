# 0015. Balance Sheet Classification and Derived Equity — Category-First, Visible Unclassified, No Retained-Earnings Fiction

Status: Accepted

## Context

Milestone 15H (Balance Sheet) needs, for a selected company and an as-of date, every
account's balance placed into Assets, Liabilities, or Equity, with the statement
reconciling: `Assets = Liabilities + Equity`. ADR-0014 (Profit & Loss) explicitly
invited this milestone to cite its *excluded* list as 15H's own *included* set rather
than re-deriving which categories are Balance Sheet categories from scratch. This ADR
takes that invitation up literally — and records the four places where Balance Sheet
composition is genuinely *not* the mirror image of P&L composition, because assuming it
was would produce a statement that is silently wrong rather than visibly wrong.

A dedicated architecture audit ran before any implementation code was written. Three of
its findings shape every decision below, and none of the three is derivable from general
accounting knowledge — each had to be traced in this repository:

**1. There is exactly one code path in this repository that creates an account.**
`bootstrap_accounting_defaults()` (`schema.sql` §23) seeds 16 accounts at company
creation. Every `from('accounts')` call site in the codebase — `js/ledgerData.js`,
`js/trialBalanceData.js`, `js/profitLossData.js`,
`js/services/accounting/resolution/accountResolutionService.js` — is a `.select()`.
There is no account-creation UI, no account import, and no other seed. The
`accounts_insert` RLS policy exists but has zero callers anywhere in the application.

**2. That seeded chart contains no equity account at all.** The 16 accounts use the
categories `cash`, `receivable`, `currentAssets`, `gst` (×8), `payable`, `income`,
`directExpenses`, and `indirectExpenses` (×2). There is no `equity` account, no
`fixedAssets` account, no `bank` account, and — after Milestone 15G's own correction —
no `suspense` or `control` account. `ACCOUNT_TYPES` contains `CAPITAL`,
`OPENING_BALANCE`, and `CLOSING_BALANCE`, and no seeded account uses any of the three.

**3. There is no closing-entry mechanism anywhere in this repository.**
`accounting_rpc.sql` defines exactly three functions — `next_journal_number()`,
`post_journal_entry()`, `reverse_journal_entry()` — none of which is a period or
year-end close. `fiscal_periods` carries a `select`-only RLS policy and has no close
RPC; `fiscalPeriodContract.js`'s `CLOSED` status is a *period state* governing whether
posting is permitted, not a journal that transfers anything. `js/profitLossData.js`'s
own header already states this consequence for its own purposes: income and expense
accounts carry their full lifetime `running_balance` and are never reset to zero.

Together these mean the question "where does Balance Sheet read equity from?" has no
answer of the expected shape. Equity is not under-populated in this repository; it is
**structurally absent**, and the statement's equity section has to be derived or the
Balance Sheet cannot exist at all.

## Decision

### 1. Classification is category-first, over a closed partition of the closed catalog

**`accounts.category` is the primary classifier, and the partition below is exhaustive
over `ACCOUNT_CATEGORIES`' 17 values** — ADR-0014's four included categories plus this
ADR's thirteen, with no value in both lists and no value in neither.

```
ASSETS       assets, currentAssets, fixedAssets, bank, cash, receivable
LIABILITIES  liabilities, currentLiabilities, payable
EQUITY       equity
BY NORMAL    gst, suspense, control          -- see 2 below
BALANCE

FOLDED INTO  income, directExpenses, indirectExpenses, expenses
EQUITY                                        -- ADR-0014's list, see 4 below
(not lines)

UNCLASSIFIED any category absent from every list above -- a future custom
             category. VISIBLE, never silently dropped. See 3 below.
```

The six Assets categories are exactly the six whose `NORMAL_BALANCE_BY_CATEGORY`
(ADR-0010) entry is `debit` and which are not expense categories; the three Liabilities
categories and `equity` are exactly the credit-derived non-income ones. This ADR
introduces **no second classification system** — it partitions the same `category`
column P&L, Trial Balance, and General Ledger already read, and asks nothing else of the
schema, exactly as ADR-0014's own final Decision paragraph requires.

### 2. `normal_balance` disambiguates `gst`/`suspense`/`control`, and nothing else

`gst`, `suspense`, and `control` are **deliberately absent** from
`NORMAL_BALANCE_BY_CATEGORY` (ADR-0010), because Input GST is an asset (debit-normal)
and Output GST is a liability (credit-normal) — the category genuinely has no single
normal balance. ADR-0010's resolution is that an account in such a category **must
declare its `normalBalance` explicitly**, and every seeded GST account does (1900–1903
`debit`, 2900–2903 `credit`).

**For exactly these three categories, and only these three, the account's own declared
`normal_balance` resolves the section**: `debit` → Assets, `credit` → Liabilities. This
invents no mechanism. It consumes the one ADR-0010 built for this exact ambiguity, at
the one place that ambiguity actually bites.

**`normal_balance` is deliberately not the primary classifier**, for a reason ADR-0010
itself supplies: Accumulated Depreciation is `fixedAssets` + credit-normal, and Sales
Returns is `income` + debit-normal. A `normal_balance`-first rule would file Accumulated
Depreciation under Liabilities. Category first, `normal_balance` only where category is
silent.

**Classification never consults the balance's sign.** An account's section is a function
of its `category` and its declared `normal_balance` — both stable facts set at Chart of
Accounts registration — never of what its balance happens to be on the selected date. A
GST account that swings to the opposite side, or a bank account that goes overdrawn,
stays in its own section and shows a negative figure there. The alternative (reclassify
by current sign, as some accounting software does for net-GST presentation) would make
an account **jump between sections between two as-of dates**, which is a worse defect
than an unconventional presentation: it makes two Balance Sheets of the same company
structurally incomparable.

### 3. An unrecognized category is VISIBLE, not silently excluded

This is the one place Balance Sheet composition must **not** mirror ADR-0014, and the
distinction is load-bearing.

ADR-0014 can safely make silent exclusion its default: leaving a Balance Sheet account
off an income statement is not a guess at any fact, it is the statement working as
designed. **Balance Sheet has no such luxury.** A silently-excluded account breaks
`Assets = Liabilities + Equity` by exactly its own balance, converting a chart-of-
accounts defect into an unexplained wrong statement with nothing on screen to explain
it.

**So an account whose category matches no list above is placed in a visible
`Unclassified` section, presented on the Liabilities + Equity side in credit sense, and
the reconciliation status explicitly reports that investigation is required.** With that
section present the extended identity `Assets = Liabilities + Equity + Unclassified`
holds exactly, so the statement still foots — while the primary check
`Assets = Liabilities + Equity` correctly fails, because there genuinely is something
to fix.

What there is to fix is the account's category, not this statement. That is 15G's own
lesson applied unchanged: ADR-0014 established that an account sitting in the wrong
category is *an Accounting Foundation defect in the chart of accounts*, fixed by
recategorising the account at its seed, never by widening a statement's inclusion list
or naming the account inside a consumer. `Unclassified` is the mechanism that makes such
a defect impossible to miss instead of impossible to see.

### 4. Equity is DERIVED from life-to-date Profit & Loss, because nothing else exists

Given Context findings 2 and 3 — no equity account, and no closing entry — the equity
section cannot be read. It is derived, and the derivation is uniquely determined rather
than chosen:

```
Total Equity  =  actual equity-account balances        (currently zero accounts)
              +  Accumulated Profit / (Loss) Brought Forward
              +  Profit / (Loss) for the Period
```

Because no closing entry ever zeroes them, income and expense accounts carry their full
lifetime balance, so **life-to-date net profit through the as-of date IS the accumulated
profit** — not an approximation of it. The two derived components split that single
figure at the current fiscal year's start:

- **Brought Forward** = life-to-date P&L strictly before the current fiscal year's
  start date.
- **Profit / (Loss) for the Period** = P&L movement from the fiscal-year start through
  the selected as-of date.
- Their sum is life-to-date P&L through the as-of date, exactly, because
  `movement = closing − opening` telescopes.

**Both components are computed by calling `buildProfitAndLossRows()`
(`js/profitLossData.js`, 15G) — the same exported pure function, twice, with different
movement arrays.** P&L category filtering is not reimplemented: that function already
self-filters to ADR-0014's four categories, so the Balance Sheet passes it the whole
chart and the whole balance array and reads `.netProfit` off the result. There is no
second P&L calculation anywhere in this milestone, and `js/profitLossData.js` is not
modified.

The fiscal-year boundary comes from `resolveFiscalYearLabel()` /
`resolveFiscalYearBounds()`, already public on `js/services/accounting/index.js`, with
`fyStartMonth` read from `companies.fy_start_month` via the existing
`getActiveCompany()`. Fiscal-year arithmetic is **not** reimplemented — `fiscalYear.js`'s
own header records why: a JS fiscal-year calculation that disagrees with Postgres
`current_fy()` on any date is a live data-integrity bug, and that module is
bug-compatible with the SQL on purpose. Re-deriving the boundary in a data module would
reintroduce exactly the divergence that module exists to prevent.

This makes `js/balanceSheetData.js` the **first data-access module to import
`js/services/accounting/index.js`** (15D's `journal-detail.html` established that a
*screen* may; no data module had). No export is added for it: both functions are
already on the public surface. This is precisely the "a helper is promoted to the public
surface when a real consumer needs it" contract
`docs/architecture/accounting-platform-architecture.md` §3 describes, arriving at its
intended use.

### 5. The derived balance is NOT called "Retained Earnings"

**Deliberately, and this is not cosmetic.** "Retained Earnings" names an account that
holds a balance transferred into it by a closing entry. This repository has neither the
account nor the entry. A line labelled "Retained Earnings" would assert to an accountant
that a year-end close has been performed and that the figure shown is what it left
behind — a claim that is false here, and one that would quietly mislead exactly the
reader most qualified to act on it.

The honest labels, which state what the numbers actually are, are used instead:

- **`Accumulated Profit / (Loss) Brought Forward`**
- **`Profit / (Loss) for the Period`**

If a future milestone introduces a real closing-entry mechanism and a real retained-
earnings account, that milestone supersedes this decision rather than silently relabelling
these lines.

### 6. Section-sense conversion for section totals; `bucketSignedBalance()` is unmodified

`balanceAt()` returns a balance signed relative to the account's **own**
`normal_balance`. `bucketSignedBalance()` (15E) turns that into a `side` plus an
absolute magnitude, which is exactly right for a per-row Dr/Cr display and exactly wrong
for a section subtotal: it discards the direction a contra account needs in order to
*subtract*. So section totals use a conversion into the section's own direction:

```js
sectionAmount = signedBalance * (account.normal_balance === sectionSense ? 1 : -1)
// sectionSense: 'debit' for Assets; 'credit' for Liabilities, Equity, Unclassified
```

Accumulated Depreciation (`fixedAssets`, credit-normal, balance +2000) yields −2000 and
correctly reduces Total Assets. A debit-normal contra liability correspondingly reduces
Total Liabilities. An overdrawn bank account (debit-normal, balance −3000) yields −3000
and reduces Total Assets without changing section.

**`bucketSignedBalance()` is not modified and not replaced.** It remains the shared Dr/Cr
display logic, called per row, exactly as Trial Balance calls it — so the two screens
still present a balance's side identically.

### 7. No new SQL object, no new balance logic

Every figure on this statement comes from one call to `balanceAt()`
(`js/ledgerData.js`, 15E) per account, with `throughInclusive: asOfDate`. **No new
table, view, RPC, column, policy, index, cached balance, or persisted balance is
introduced, and `schema.sql`/`accounting_rpc.sql`/RLS are untouched.**

ADR-0013's proof applies to this milestone without modification.
`v_journal_ledger_lines.running_balance` is a prefix sum, so "filter to
`entry_date <= X`, take the latest survivor" is exactly the balance as of `X`; every
single-query technique that picks one row per account first is wrong for an arbitrary
historical date, and the one correct single-query shape needs a parameterized stored
function. The bounded fan-out is `N` = chart-of-accounts size — 16 for a seeded company,
tens for an SMB — never transaction volume. ADR-0013's explicit RPC threshold (a
*measured* latency problem at several hundred active accounts) governs here unchanged.

The query cost is one `accounts` read, one `getActiveCompany()` read (for
`fy_start_month`), and **two `balanceAt()` calls per account** — the as-of-date balance
the statement is built from, and a fiscal-year-opening balance needed only to split the
derived profit. All are parallel, and `N` is chart-of-accounts size. This is the most
expensive of the three ledger-derived screens: Trial Balance needs one call per account
and P&L two per *included* account, where Balance Sheet needs two per account across the
whole chart. It remains squarely inside ADR-0013's envelope, which bounds the fan-out by
chart size rather than transaction volume, and its RPC threshold is unchanged.

The fiscal-year fan-out deliberately covers the whole chart rather than only the P&L
subset. Restricting it would save a handful of bounded, indexed single-row lookups at the
cost of placing a second copy of ADR-0014's category list on the query path — where any
drift between that copy and `buildProfitAndLossRows()`' own list would silently corrupt
the brought-forward figure. The saving does not justify the coupling at this scale.

**The Balance Sheet is never paginated.** It is a complete financial statement that must
reconcile as one whole; a page of it is not a smaller Balance Sheet, it is a
non-statement. Every account is fetched at every status, including `inactive` — for the
same reason 15F includes every status, only stronger here, since omitting an inactive
account with a historical balance would break the identity outright.

### 8. Reconciliation, and where the display epsilon may and may not live

The statement reconciles by construction, not by assertion. Every posted entry satisfies
`Σdebit = Σcredit` (`post_journal_entry()`'s DB-side assertion, ADR-0008's exact-integer
check), so summing every account in debit sense across the whole chart is exactly zero.
Partitioning that sum by the exhaustive classification above:

```
Assets(dr) − Liabilities(cr) − EquityAccounts(cr) − NetProfit(cr) + Unclassified(dr) = 0

  ⇒   Assets  =  Liabilities  +  [ EquityAccounts + NetProfit ]  +  Unclassified(cr)
                                  └────────── Total Equity ──────────┘
```

Worked against this repository's real posting providers — one cash sale
(₹1000 + 90 CGST + 90 SGST) and one credit purchase (₹500 + 45 + 45), using the line
shapes `salesPostingProvider.js` and `purchasePostingProvider.js` actually emit:
Assets 1180 + 45 + 45 = 1270; Liabilities 90 + 90 + 590 = 770; Equity 0 + (1000 − 500)
= 500; and 1270 = 770 + 500.

The screen displays Total Assets, Total Liabilities, Total Equity, Unclassified (when
non-empty), the difference, and a reconciliation status — a balanced statement reads
`Balanced`, and any unexplained difference reads as an explicit investigation state.
**The discrepancy is never hidden or absorbed.**

The comparison uses the same display-only epsilon `trial-balance.html` already
established (`Math.abs(difference) < 0.005`), for float noise in summed `numeric(14,2)`
values. This epsilon is **presentation of a derived total, and is confined to it**. It
is not in the posting path, not in a validator, and not in any accounting-correctness
check — ADR-0008's prohibition ("a double-entry validator that tolerates imbalance is
not a double-entry validator", against the counter-example of
`xmlBusinessRules.js`'s 0.5-rupee tolerance on a signed ledger sum) is a rule about
*validating an entry*, which this screen never does. It re-validates nothing
`post_journal_entry()` already guarantees; a discrepancy here means something is wrong
upstream, not something this screen corrects.

## Alternatives considered

**Add a `3000 Capital` account to `bootstrap_accounting_defaults()` so the equity
section is non-empty.** Rejected. 15G's own correction re-categorised an account that
already existed and was already being posted to; seeding a *new* account is a different
act, requiring a `bootstrap_accounting_defaults()` change plus a backfill of already-
provisioned companies. Nothing in this codebase would ever post to it — there is no
capital, opening-balance, or drawings workflow — so it would contribute a permanent zero
line and make the statement no more correct, only less honest about the state of the
data. See Consequences for the gap this leaves open and where it belongs.

**Call the derived figure "Retained Earnings".** Rejected — see Decision 5. It asserts a
closing entry that never happened, to the reader most likely to rely on it.

**Present a single "Accumulated Profit / (Loss)" line, without the brought-forward /
current-period split.** Rejected, though it is genuinely simpler and would avoid both
the `getActiveCompany()` read and the `index.js` import. A Balance Sheet that cannot
say how much of the accumulated profit was earned in the current year answers only half
the question its equity section exists to answer, and the split is fully derivable from
data already present, with no schema change and no second P&L calculation.

**Derive the fiscal-year boundary inline in `js/balanceSheetData.js` instead of importing
`js/services/accounting/index.js`.** Rejected: it would duplicate fiscal-year logic that
already exists and is deliberately bug-compatible with Postgres `current_fy()`, creating
exactly the JS/SQL divergence `fiscalYear.js`'s header identifies as a live
data-integrity bug. Importing an already-public function is the sanctioned path.

**Silently exclude unrecognized categories, mirroring ADR-0014's default.** Rejected —
see Decision 3. Correct for an income statement, silently wrong for a Balance Sheet.

**Classify `gst`/`suspense`/`control` by the sign of the current balance rather than by
declared `normal_balance`** (netting Input GST into Liabilities when the company is in a
net-payable position, as some software presents it). Rejected: it makes an account's
section a function of the selected date, so two Balance Sheets of the same company
become structurally incomparable. Declared `normal_balance` is a stable fact; the
current balance is not.

**Extend `bucketSignedBalance()` to return a section-oriented signed amount.** Rejected:
it is shared with `ledger.html` and `trial-balance.html`, where the `side` + absolute
magnitude shape is exactly right, and changing it to serve a third consumer's different
need would be a breaking change to two working screens for no gain. Section-sense
conversion is Balance Sheet's own concern and stays in Balance Sheet's own module.

**A `get_balance_sheet(company_id, as_of_date)` RPC, or a second SQL view.** Rejected
for this milestone on ADR-0013's reasoning, unchanged: this schema's only write RPCs are
`SECURITY DEFINER` with hand-coded membership checks, a read-only RPC here would either
repeat that pattern for no write or become this schema's first `SECURITY INVOKER`
function with no precedent, and no measured performance problem motivates either.
Deferred at ADR-0013's stated threshold, not rejected forever.

**Paginate the Balance Sheet** for a large chart of accounts. Rejected: a paginated
financial statement cannot reconcile, and reconciliation is the statement's primary
correctness property.

## Consequences

- Balance Sheet introduces **zero new database objects**. `schema.sql`,
  `accounting_rpc.sql`, and RLS are untouched, matching 15F's posture rather than 15E's.
- `js/profitLossData.js`, `js/ledgerData.js`, and `js/trialBalanceData.js` are
  **unmodified**. 15H composes on `balanceAt()`, `bucketSignedBalance()`, and
  `buildProfitAndLossRows()` exactly as they already exist — the accumulated-profit
  figure on the Balance Sheet is literally 15G's own function's `netProfit`, not a
  parallel derivation of it.
- `js/balanceSheetData.js` is the first data-access module to import
  `js/services/accounting/index.js`. The platform's public surface is unchanged; this is
  the surface being used as designed.
- The equity section of a freshly-seeded company shows **no equity accounts and two
  derived lines**. That is an accurate rendering of this ledger, not a defect in this
  screen.
- **Carried forward as an Accounting Foundation gap, deliberately not solved here:**
  Capital, Drawings, Opening Balances, and an equity-account workflow. With no equity
  account and no account-creation UI, a user cannot record proprietor capital today —
  even the Manual Journal can only select accounts that already exist. This belongs to a
  future, dedicated Accounting Foundation / Opening Balances milestone, which will need
  its own decisions about account seeding, opening-balance entry, and whether a real
  closing-entry mechanism (and with it, a genuine Retained Earnings account) is
  introduced. When that milestone lands, Decision 5's labels are the thing it supersedes.
- A future custom category is surfaced, not swallowed: it lands in `Unclassified`, the
  primary reconciliation reports an investigation state, and the extended identity still
  foots so the numbers remain auditable while the underlying category defect is fixed at
  the chart of accounts.
- A future contributor adding a Balance Sheet category must add it to the partition in
  Decision 1 explicitly, by name, here or in a superseding ADR — the same rule ADR-0014
  applies to broadening its own included list.
- ADR-0014's invitation is now discharged: the excluded list it recorded is this ADR's
  included set, and the two ADRs together partition `ACCOUNT_CATEGORIES` exhaustively
  with no category in both and none in neither.

## References

- `docs/architecture/ADR/0014-profit-loss-account-classification.md` — the excluded list
  this decision adopts as its included set, and the "an account in the wrong category is
  a Foundation defect, not a statement special case" rule Decision 3 extends
- `docs/architecture/ADR/0013-trial-balance-bounded-fanout-over-ledger-view.md` — the
  bounded fan-out and the proof that no single-query technique is correct for a
  historical date; its RPC threshold governs here unchanged
- `docs/architecture/ADR/0012-ledger-view-as-canonical-running-balance-projection.md` —
  `v_journal_ledger_lines`, the prefix-sum property, and `security_invoker = true`
- `docs/architecture/ADR/0010-account-open-catalog-closed-derivation.md` — the closed
  derivation table, and the "must declare `normalBalance` explicitly" rule Decision 2
  consumes for `gst`/`suspense`/`control`
- `docs/architecture/ADR/0008-accounting-money-integer-minor-units.md` — the no-tolerance
  rule Decision 8's display epsilon is explicitly outside of
- `schema.sql` §23 `bootstrap_accounting_defaults()` — the 16-account seeded chart, and
  the evidence for Context findings 1 and 2
- `accounting_rpc.sql` — its three functions, and the evidence for Context finding 3
- `js/ledgerData.js` — `balanceAt()`, `bucketSignedBalance()`
- `js/profitLossData.js` — `buildProfitAndLossRows()`, reused unmodified for both equity
  components
- `js/services/accounting/fiscal/fiscalYear.js` — `resolveFiscalYearLabel()` /
  `resolveFiscalYearBounds()`, and the Postgres bug-compatibility rationale for not
  re-deriving them
