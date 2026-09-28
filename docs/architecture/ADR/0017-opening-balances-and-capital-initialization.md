# 0017. Opening Balances and Capital Initialization — Fiscal-Period-Scoped, ref_table-Idempotent, No Second Ledger

Status: Accepted

## Context

ADR-0015 named the gap explicitly and left it unsolved on purpose: *"Carried forward
as an Accounting Foundation gap, deliberately not solved here: Capital, Drawings,
Opening Balances, and an equity-account workflow... With no equity account and no
account-creation UI, a user cannot record proprietor capital today — even the Manual
Journal can only select accounts that already exist."* Milestone 15J is the
"future, dedicated Accounting Foundation / Opening Balances milestone" that ADR-0015's
own Consequences section anticipated.

A repository audit ran before any code was written (see the 15J audit + architecture
decision report). Four findings shape every decision below, none derivable from general
accounting knowledge alone — each had to be traced in this repository:

**1. `VOUCHER_TYPES.OPENING`/`ACCOUNT_TYPES.OPENING_BALANCE`/`ACCOUNT_TYPES.CAPITAL`
already exist, declared since 15A, with zero call sites** — the same "vocabulary
reserved, nothing wired" state `RECEIPT`/`PAYMENT` sat in until 15I actually built the
providers for them (ADR-0016).

**2. `journal_entries.ref_table`/`ref_id` and its unique index `idx_je_ref` already
provide an atomic, race-safe idempotency mechanism** — `post_journal_entry()` checks it
before inserting and again on `unique_violation`, returning `was_duplicate` either way.
Every voucher type except Manual Journal already threads a real `ref_table`/`ref_id`
pair through `AccountingPlatform.post({ ref })`.

**3. `create_company()` seeds exactly one `fiscal_periods` row per company, and no code
path anywhere ever inserts a second one** — `fiscal_periods` carries a select-only RLS
policy. `post_journal_entry()` fails closed for any `entry_date` outside whichever
period's `[start_date, end_date]` covers it: `raise exception 'no fiscal period covers
%'`.

**4. `v_journal_ledger_lines.running_balance` is a window function ordered by
`(entry_date, journal_no, line_no)`, recomputed on every query (a plain, non-materialized
view)** — an opening entry posted after other transactions already exist, but dated at
the fiscal period's own `start_date`, sorts first and is included correctly in every
downstream balance with zero code change to General Ledger, Trial Balance, P&L, or
Balance Sheet.

No architectural blocker exists. This ADR records the four decisions the audit required
before implementation, all approved as documented.

## Decision

### 1. Opening balances ARE allowed with existing transaction history — bounded by the fiscal period that already exists

There is no rule in this repository, and none is introduced here, that opening balances
require a company to have zero transaction history. The real constraint is the one
`post_journal_entry()` already enforces on every voucher type: **the opening entry's
`entry_date` must fall inside a `fiscal_periods` row that exists and is `open`.** Since a
company has exactly one seeded period (the FY containing its creation date) and nothing
in this repository ever creates a second one, the practical rule is that the opening date
must fall inside that period's date range. `js/openingBalanceData.js`'s
`getApplicableFiscalPeriod()` reads every period a company actually has and returns the
earliest one — for the overwhelmingly common single-row case this is simply that row; for
the rare case of more than one, the earliest period is the accounting-correct place for
an opening entry, since it represents the true start of the company's books.

Existing transaction history inside that same period is not a blocker, because of finding
4 above: running-balance ordering is by `entry_date`, never insertion order, so an opening
entry dated at the period's `start_date` sorts first regardless of when it was actually
posted.

### 2. Duplicate protection reuses `ref_table`/`ref_id` — no new column, no new table

One opening entry per company per fiscal period. `js/openingBalanceData.js`'s
`postOpeningBalance()` passes `ref: { table: 'fiscal_periods', id: fiscalPeriodId }` to
`AccountingPlatform.post()`, which threads it to `post_journal_entry()`'s own existing
`idx_je_ref` uniqueness — the identical mechanism ADR-0016 already established for
`ref_table = 'payments'`. This is atomic and race-safe by construction (finding 2 above);
nothing new was built for it. `findExistingOpeningEntry()` performs a read-only advisory
pre-check so the screen can show "an opening balance already exists" before a submission
attempt, but it is explicitly documented as advisory only — the caller still branches on
the posting result's own `wasDuplicate`, never on the pre-check alone.

### 3. Capital/equity is a real account balance, posted through the existing model — with the narrowest possible account-creation exception

The Opening Balance screen lets the user pick any existing account for the capital/equity
side, the same direct-account-search shape Manual Journal already established
(`js/manualJournal.js`'s `searchAccounts()`, reused unmodified). When the chart has no
`equity`-category account at all — the seeded chart never has one, per ADR-0015's own
audit — the screen offers to create exactly one, through `createEquityAccount()`:

- `category` is hard-coded to `ACCOUNT_CATEGORIES.EQUITY`, never a caller-supplied value.
- `normal_balance` is derived through the existing, unmodified `deriveNormalBalance()`
  (`credit`, per ADR-0010's own closed derivation table) — never re-decided here.
- The write is a direct client insert against `accounts`, gated by the
  **already-existing** `accounts_insert` RLS policy (`is_owner_of_company` — owner/manager
  only, unchanged). No new RPC is introduced for this.
- Only `code` and `name` are caller-supplied, validated by the same DB constraints every
  other account already obeys (`unique(company_id, code)`, `normal_balance in
  ('debit','credit')`).

This is not a Chart of Accounts management feature: there is no edit, no deactivate, no
hierarchy, no bulk import here — one narrowly-scoped creation path for exactly the account
this workflow cannot function without, matching ADR-0015's own framing of the gap it
carried forward.

Posting uses `VOUCHER_TYPES.OPENING` (declared since 15A, first wired here) and the new,
additive `POSTING_SOURCES.OPENING` (added to `journalContract.js`'s existing frozen
catalog, the same pattern that already distinguishes `REVERSAL` from `ADJUSTMENT`
carrying different audit weight than an ordinary manual correction). The resulting entry
is a real balance in a real equity account, computed exactly like every other account's
balance by `balanceAt()` — it is not folded into, or confused with, Balance Sheet's
*derived* `Accumulated Profit / (Loss)` figure (ADR-0015 Decision 4), which remains a
computation over P&L movement, untouched by this milestone.

### 4. `parties.opening_balance` is out of scope, and stays untouched

`parties.opening_balance` is written only by the Tally XML import path
(`js/services/dataExchange/xml/writers/openingBalanceWriter.js`), at party-creation time,
setting `opening_balance` and `current_balance` together. It has never been connected to
a journal entry, is not exposed in any party-creation UI, and — decisively —
`journal_lines` has no `party_id` column at all: Accounts Receivable/Payable have always
been single control accounts (codes `1010`/`2000`), with per-party detail living only in
`parties.current_balance`, never in the ledger.

Converting it into journal entries retroactively would risk double-counting against
`current_balance` (already authoritative, already incremented by
`create_sale()`/`create_purchase()`/`record_payment()`), and there is no schema column to
attribute a control-account ledger line back to an individual party even if that were
attempted. This milestone does not add one (`journal_lines` is untouched).

The Opening Balance screen may post an aggregate control-account line (e.g. "Accounts
Receivable Dr ₹50,000" against the one existing control account) with a party name used
only as free-text `narration` — display information, never a structured link. Full
party-level opening receivable/payable reconciliation is an explicit non-goal of this
milestone, not a partially-built feature.

## Alternatives considered

**Restrict opening balances to companies with zero transaction history.** Rejected —
nothing in the existing architecture requires it, and the real business case (a company
already trading, now formalizing its books) would be unsupported for no technical reason.
The actual constraint (fiscal-period date range) already exists and does the necessary
work.

**A dedicated `opening_balance_posted` boolean or a new duplicate-tracking table.**
Rejected — `journal_entries.ref_table`/`ref_id` and its unique index already solve this
atomically and race-safely for every other voucher type; adding a second mechanism would
be a duplicate of one that already exists and is already trusted.

**Seed a `3000 Capital` account into `bootstrap_accounting_defaults()` for every future
company.** Considered and rejected for the same reason ADR-0015 rejected it: a company
that never initializes capital would carry a permanent zero line, and this milestone can
create the account narrowly, on demand, only when it is genuinely needed.

**Fold opening-balance posting into `POSTING_SOURCES.MANUAL`.** Rejected — an opening
entry establishes a company's books for a fiscal period and carries different audit
weight from an ordinary hand-entered correction, the same distinction this file's own
`REVERSAL`/`ADJUSTMENT` split already draws. A dedicated, additive constant costs nothing
and preserves that distinction for Journal Register/reporting filters.

**Convert `parties.opening_balance` into journal entries in this milestone.** Rejected —
see Decision 4. This would risk double-counting against `current_balance`, has no schema
support for party-level ledger attribution, and would expand this milestone into work its
own brief explicitly excludes.

**A general Chart of Accounts management screen (create/edit/deactivate any account).**
Rejected — out of scope by explicit instruction; the one account-creation path this
milestone ships is the minimum required for capital initialization to function at all,
gated by the existing owner/manager-only RLS policy, nothing more.

## Consequences

- Zero changes to `schema.sql`, `accounting_rpc.sql`, RLS policies, the Journal Engine,
  `postingFacade.js`, or any existing posting provider. `journal_entries`,
  `journal_lines`, `fiscal_periods`, and `accounts` are all read/written exclusively
  through mechanisms that already existed before this milestone.
- General Ledger, Trial Balance, Profit & Loss, and Balance Sheet require zero code
  changes to reflect opening entries correctly — they already compose on
  `v_journal_ledger_lines`/`balanceAt()` generically over voucher type, the same way they
  picked up `receipt`/`payment` in 15I with no code change.
- A company's opening balance is permanently bounded by whichever fiscal period(s) it
  actually has. A future Fiscal Period Management milestone (creating/closing additional
  periods) is a prerequisite for opening balances dated before a company's first seeded
  period — this milestone does not attempt to solve that, and does not pretend to.
- `POSTING_SOURCES.OPENING` is now part of the platform's open, additive catalog; a future
  contributor filtering or reporting on posting source should treat it as a first-class,
  distinct value from `MANUAL`.
- The one account-creation path this milestone ships (`createEquityAccount()`) is
  permanently narrow: fixed category, derived normal balance, owner/manager-only RLS,
  code/name only. Extending it into general account management is explicitly a different,
  future milestone's decision, not an incremental extension of this one.
- `parties.opening_balance` remains exactly what it was before this milestone: an
  operational, Tally-import-only field, disconnected from the ledger. A future milestone
  connecting customer/supplier-level opening balances to the ledger would need its own
  decision about `journal_lines`' lack of a `party_id` column — this ADR does not
  anticipate what that decision should be.

## References

- `docs/architecture/ADR/0015-balance-sheet-classification-and-derived-equity.md` — the
  gap this ADR closes, and the "an account in the wrong category/without one at all is an
  Accounting Foundation defect" framing this milestone's account-creation exception
  extends narrowly
- `docs/architecture/ADR/0016-payment-receipt-settlement-and-posting-boundary.md` — the
  `ref_table`/`ref_id` idempotency pattern this milestone reuses unmodified, and the
  precedent for wiring a long-declared, previously-unused `VOUCHER_TYPES` value
- `docs/architecture/ADR/0010-account-open-catalog-closed-derivation.md` — the closed
  `deriveNormalBalance()` table `createEquityAccount()` calls rather than re-deriving
- `js/openingBalanceData.js` — `getApplicableFiscalPeriod()`, `findExistingOpeningEntry()`,
  `hasEquityAccount()`, `createEquityAccount()`, `postOpeningBalance()`
- `js/services/accounting/providers/openingBalancePostingProvider.js` — the posting
  provider, structurally identical to `manualJournalPostingProvider.js`
- `js/services/accounting/contracts/journalContract.js` — `VOUCHER_TYPES.OPENING`
  (declared since 15A), `POSTING_SOURCES.OPENING` (added in this milestone)
- `schema.sql` §24 `fiscal_periods`, §25 `journal_entries` (`ref_table`/`ref_id`,
  `idx_je_ref`) — the evidence for Context findings 2 and 3
- `accounting_rpc.sql` `post_journal_entry()` — the fiscal-period-fails-closed check and
  the idempotency fast-path/race-path this milestone relies on unmodified
