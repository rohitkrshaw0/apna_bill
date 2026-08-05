# Accounting Platform Architecture

The permanent architecture reference for `js/services/accounting/`, the Accounting Platform
Foundation built in Milestone 15A. This is a living architecture document (per
`platform-roadmap.md` §9) — it evolves as the platform is extended. It is not a milestone
report; `docs/reports/milestone-15A-completion.md` is the historical record of what 15A
built and verified.

**Read this before changing anything under `js/services/accounting/`.**

---

## 1. What this platform is

The reusable double-entry accounting architecture every future accounting feature plugs
into. It is the ninth infrastructure platform in this application, sibling to `events/`,
`diagnostics/`, `jobs/`, `audit/`, `extensions/`, `businessIntelligence/`, `dataExchange/`,
and `reporting/`.

**What it is not, as of Milestone 15A:** it holds no balances, posts nothing, persists
nothing, renders nothing, and has zero consumers. It computes no ledger, no trial balance,
no P&L, and no balance sheet. It is the same "foundation only, consumers later" shape
Milestone 14A used for the Reporting Platform.

Every future ERP transaction — sales, purchases, inventory movements, manufacturing,
payments, receipts, GST, manual journals, opening balances, adjustments, reversals — will
eventually become journal entries. This platform defines the contracts, registries, and
validators that make that possible without implementing any of it.

## 2. Module map and dependency direction

```
js/services/accounting/
  index.js                              the public API surface (see §3)
  shared/
    freezeDeep.js                       own copy of the canonical deep-freeze primitive
    generateId.js                       own copy of the canonical id primitive
    isoDate.js                          'YYYY-MM-DD' format + real-calendar validation
    money.js                            integer-paise money representation (see §4)
  contracts/
    accountContract.js                  AccountDefinition + category/type/normal-balance catalogs
    journalContract.js                  JournalEntry + JournalLine
    voucherTypeContract.js              VoucherTypeDefinition
    postingProviderContract.js          PostingProviderDefinition
  registry/
    accountRegistry.js                  the Chart of Accounts
    voucherTypeRegistry.js
    postingProviderRegistry.js
  validation/
    validationResult.js                 the shared { isValid, errors } shape
    journalEntryValidator.js            balanced-entry and business-rule validation
  fiscal/
    fiscalYear.js                       FY label/bounds derivation
    fiscalPeriodContract.js             FiscalPeriod + pure state transitions
    fiscalPeriodService.js              per-company period registration and transitions
  accountingPlatform.test.html          the platform's own test suite
```

**Dependency direction: nothing under `js/services/accounting/**` imports anything outside
that directory.** This is a stronger claim than the Reporting Platform's own — reporting
imports `diagnostics/` and `supabaseClient.js`. Nothing here runs, logs, or resolves a
company, so the platform is genuinely self-contained. Confirmed by grep at every commit.

Internally the direction is one-way, with no cycles:

```
shared/  ->  contracts/  ->  registry/
                    \
                     ->  validation/  ->  fiscal/
```

`validation/journalEntryValidator.js` calls `fiscal/fiscalPeriodContract.js`'s
`canPostToPeriod()`/`isDateWithinPeriod()`. Fiscal never depends on validation.

**Nothing else in the repository imports this platform.** Zero consumers is the point of a
foundation milestone; the first consumer is Milestone 15B.

## 3. Public API (`js/services/accounting/index.js`)

**`index.js` is the versioned public surface. Only what it re-exports is public API.**
Everything else — field-level validators, the `shared/` primitives, the granular
line-error finder functions, internal constants — is an implementation detail, free to
change without a breaking-change event.

The rule is deliberate and binding for Milestones 15B–15F: **adding an export later is
non-breaking; removing one is breaking.** So a helper is promoted to the public surface
only when a real consumer needs it, never preemptively.

| Group | Public exports |
|---|---|
| Money | `roundMoney`, `toMinorUnits`, `fromMinorUnits`, `isMoneyAmount`, `MONEY_SCALE`, `MINOR_UNITS_PER_MAJOR`, `MONEY_LIMITS` |
| Account contract | `ACCOUNT_CATEGORIES`, `ACCOUNT_TYPES`, `NORMAL_BALANCES`, `ACCOUNT_STATUS`, `deriveNormalBalance`, `isDebitNormal`, `isContraAccount`, `createAccountDefinition`, `assertValidAccountDefinition` |
| Journal contract | `VOUCHER_TYPES`, `POSTING_SOURCES`, `createJournalLine`, `createJournalEntry`, `assertValidJournalLine`, `assertValidJournalEntry` |
| Voucher types | `VOUCHER_CATEGORIES`, `createVoucherTypeDefinition`, `assertValidVoucherTypeDefinition`, `createVoucherTypeRegistry` |
| Posting providers | `createPostingProviderDefinition`, `assertValidPostingProviderDefinition`, `createPostingProviderRegistry` |
| Registries | `createAccountRegistry` |
| Validation | `JOURNAL_ERROR_CODES`, `computeEntryTotals`, `isBalanced`, `validateJournalEntry`, `assertBalancedJournalEntry`, `formatValidationErrors` |
| Fiscal | `resolveFiscalYearLabel`, `resolveFiscalYearBounds`, `DEFAULT_FY_START_MONTH`, `FISCAL_PERIOD_STATUS`, `createFiscalPeriod`, `assertValidFiscalPeriod`, `toClosed`, `toReopened`, `toLocked`, `canPostToPeriod`, `isDateWithinPeriod`, `createFiscalPeriodService` |
| Shared singletons | `accountRegistry`, `voucherTypeRegistry`, `postingProviderRegistry` |

`accountingPlatform.test.html` imports **only** from `index.js`. That is what proves the
public surface is sufficient to exercise the platform; a test needing a deep import would
be the signal that the surface is wrong, not a reason to widen it ad hoc.

**Three singletons, not one.** Reporting exported one because it had one registry. This
platform genuinely has three independent charts, and a shared instance of each *is* its
extension point (§11). Importing `index.js` has no side effect beyond constructing three
empty `Map`s.

**There is deliberately no `fiscalPeriodService` singleton.** `fyStartMonth` comes from
`companies.fy_start_month`, which is per-company (and is `1`, not `4`, in at least one
existing test fixture). A shared instance would bake one company's fiscal calendar into
every caller and silently mislabel another company's years. A service is constructed by
whoever loads a specific company's chart of accounts.

## 4. Money — integer minor units (ADR-0008)

The decision the whole platform rests on.

Money in this application is 2-decimal: every monetary column in `schema.sql` is
`numeric(14,2)`, and `js/gst.js` rounds every computed amount to 2 decimals. But IEEE-754
doubles cannot represent most 2-decimal values exactly, so `sumDebits === sumCredits` is
not a sound balance test. An epsilon tolerance is worse: a double-entry validator that
tolerates imbalance is not a double-entry validator.

**Integer paise are canonical.** A rupee amount converts once, at contract construction,
via `Math.round(n * 100)`. The balance check is an exact integer `===` with no epsilon
anywhere in the balance path.

**Sub-paise input is rejected, not silently rounded.** Rounding belongs to whoever
*computes* an amount (a future posting provider, using `gst.js`'s math); recording is this
platform's job. Silently turning `100.005` into `100.01` hides the caller's bug and
produces an entry whose debits and credits were each rounded independently.

The precision test separates float representation noise from genuine sub-paise precision,
in the scaled domain:

```js
const scaled = amount * 100;
const minor  = Math.round(scaled);
if (Math.abs(scaled - minor) > 1e-6) throw new TypeError(...);
```

`1e-6` scaled is `1e-8` rupees. A genuine 2dp value lands within ~`1e-10` of an integer
after scaling; the smallest genuine sub-paise value, `0.001`, scales to `0.1` — five orders
of magnitude outside the window. `0.1 + 0.2` is accepted as `30` paise; `1.15` is accepted
as `115` (the classic `1.15 * 100 === 114.99999999999999` trap); `0.005` is rejected.

**Relationship to `js/gst.js`**: `roundMoney()` converges on `gst.js`'s `R()` rounding
math deliberately, so an amount computed there never fails here. It diverges on one point,
also deliberately: `R(null)` and `R(NaN)` return `0`. In tax math that is a forgiving
default; in a ledger it is data loss. This platform throws.

**Counter-example this platform exists to not repeat**:
`dataExchange/xml/validators/xmlBusinessRules.js` checks `Math.abs(sum) > 0.5` on a signed
ledger-entry sum and emits a *warning* — a half-rupee tolerance on a double-entry check.

## 5. The Account Definition Contract

`AccountDefinition`: `id`, `code`, `name`, `category`, `type`, `normalBalance`, `parentId`,
`isReserved`, `status`, `description`, `metadata`. Deep-frozen; optional fields normalized
to `null`.

**Open catalogs, closed derivation table (ADR-0010).** `ACCOUNT_CATEGORIES` and
`ACCOUNT_TYPES` are validated as non-empty strings, *not* membership — the same rule
`reportContract.js` applies to its own `category`, so future categories can grow. But
normal-balance *derivation* needs a known category, so:

> The catalog is open. The derivation table is closed. An account whose category is not in
> the derivation table must declare its `normalBalance` explicitly.

`gst`, `suspense`, and `control` are **deliberately absent** from the derivation table.
Input GST is an asset (debit-normal); Output GST is a liability (credit-normal) — the
category genuinely has no single normal balance. Same for Suspense and Control. Their
absence makes the "must declare" rule do real work from day one, against three concrete
cases inside the catalog itself.

`NORMAL_BALANCES` and `ACCOUNT_STATUS` **are** membership-enforced: there is no third side
to an entry, and no meaningful custom status without a workflow model this milestone does
not build.

**Declared ≠ derived is legal.** Accumulated Depreciation is `fixedAssets` + credit-normal;
Sales Returns is `income` + debit-normal. These are contra accounts, not errors.
`isContraAccount()` exposes the distinction so the permissiveness reads as a decision
rather than a missing check.

## 6. The Journal Contract

**Two non-negative amount fields, not one signed amount (ADR-0009).** A `JournalLine`
carries `debit` and `credit`, each defaulting to `0` (not `null`), with an
exactly-one-is-positive invariant enforced by the validator. A signed `amount: 0` cannot
distinguish "unfilled" from "zero", which would make one class of malformation
undetectable; the sign convention would become tribal knowledge; and two fields map
directly onto `check ((debit = 0) <> (credit = 0))` — an idiom `schema.sql` already uses on
`invoice_attachments`.

Each line stores **both** representations, computed once at construction and frozen:
`debit`/`credit` in rupees (what a future `numeric(14,2)` column holds) and
`debitMinor`/`creditMinor` in canonical integer paise. They cannot drift, and the balance
path never touches a float.

Negative amounts are rejected outright — a negative debit is a credit.

**`createJournalEntry()` does not run the balance check.** The factory guarantees *shape*;
`validateJournalEntry()` guarantees *accounting correctness*. Balance validation takes
optional injected collaborators a throwing constructor cannot accept, must report every
error rather than the first, and a future manual-voucher screen must be able to hold an
unbalanced draft and render exactly why.

**`voucherType` vs `postingSource`** are not redundant: `voucherType` is the document class
a user recognises; `postingSource` records who produced the lines. A journal typed by a
human and one generated by a year-end routine are the same document class with completely
different audit weight.

**`createdBy` is carried, validated, and unenforced** — there is no roles/permissions model
in this application to resolve or check an actor against. Identical situation to
reporting's `requiredCapability`; ADR-0003's reasoning applies unchanged.

## 7. Validation framework

**Contract construction throws; business-rule validation returns a result (ADR-0011).**
The two live precedents in this repository answer different questions:

- A malformed definition is a **programmer error** — loud, immediate, un-swallowable
  `TypeError`. Every platform here does this.
- An unbalanced voucher is ordinary **user input** — it fails several independent rules at
  once and needs machine-mappable codes per line. Returns
  `{ isValid, errors: [{ code, message, ...details }] }`, the shape
  `extensions/validation/dependencyValidator.js` already established.

`assertBalancedJournalEntry()` bridges the two so neither call site duplicates logic.

Codes: `MINIMUM_LINES`, `LINE_SIDE_MISSING`, `LINE_SIDE_BOTH`, `NEGATIVE_AMOUNT`,
`UNBALANCED`, `DUPLICATE_ACCOUNT`, `UNKNOWN_ACCOUNT`, `INACTIVE_ACCOUNT`,
`PERIOD_NOT_OPEN`, `DATE_OUTSIDE_PERIOD`.

**Casing split, on purpose:** error code values are `SCREAMING_SNAKE`
(`dependencyValidator.js`'s convention); domain enum values are `lowerCamel`
(`reportContract.js`'s convention). Both are live precedents — do not "fix" one to match
the other.

**Duplicate accounts are allowed by default.** A payment voucher settling two invoices
against the same party account with distinct narrations is standard practice; forbidding
duplicates would reject legitimate vouchers. `findDuplicateAccounts()` remains available
internally so a future UI can warn without failing the entry.

**`accountRegistry` and `fiscalPeriodService` are optional collaborators, null by default.**
The validator must work on a bare entry with no registry — unit tests, and a future import
pipeline validating shape before a chart of accounts is loaded.

**Unreachable by construction, deliberately not coded:** an all-zero "balanced at 0 === 0"
entry cannot reach the balance check, because the strict `> 0` XOR already errors every
zero line. No `ZERO_TOTAL` rule exists; adding one would be dead code.

## 8. Registries

All three follow the six-method Map-closure idiom
(`register`/`get`/`list`/`has`/`unregister`/`clear`) established by
`reporting/registry/reportRegistry.js`: `register()` validates *before* the duplicate
check, `get()` returns `null` on a miss, `list()` returns a new sorted array.

**`accountRegistry`** adds three things, each earning its place:

1. **Duplicate `code` rejection** — a chart with two ledgers sharing code `1100` is corrupt.
   The index that enforces it also makes `getByCode()` O(1).
2. **`parentId` must already be registered.** This mirrors the missing-dependency rejection
   in `extensions/validation/dependencyValidator.js`, and it has a useful consequence:
   **because a parent must already exist, a hierarchy cycle is impossible by
   construction.** There is no cycle detector here and none is needed — unlike
   `detectCircularDependency()` in extensions, where dependencies may be declared against
   not-yet-registered ids. An ordering constraint replaces a file of graph code.
   `unregister()` correspondingly refuses to orphan a child.
3. **`list()` sorts by `code`**, numerically (`{ numeric: true }`, so `9` precedes `10`) —
   a chart of accounts prints in code order, not name order.

**`voucherTypeRegistry`** sorts by `name` instead: a voucher-type picker is alphabetical,
with no code-ordering convention.

**`postingProviderRegistry`** adds `findProvidersForVoucherType()` — the reason
`PostingProviderDefinition.voucherTypes` exists. Modeled on
`extensions/registry/capabilityRegistry.js` and **deliberately dumb**: it returns a
possibly-empty, possibly-multi-element list and does not rank, does not enforce
one-provider-per-voucher-type, and does not auto-resolve "the" provider. Conflict
resolution is a 15B posting-pipeline decision, not a registry concern.

## 9. Voucher types vs posting providers

They are two registries, not one, because the relationship is many-to-one **and partial**:

- A **VoucherType** is the *document class* a user recognises ("Sales Invoice", "Payment",
  "Journal"). It answers *what kind of document is this?* Its consumers are pickers,
  registers, filters, reports.
- A **PostingProvider** is the *rule* converting a source document into balanced journal
  lines. It answers *who knows how to produce the double entry for this?*

One provider can serve several voucher types (`sales` + `salesReturn`), and a voucher type
can exist with **no** provider at all — a manual `journal` where the user supplies the
lines and there is nothing to generate. Collapsing them would force every manual voucher
type to carry a null provider, and every multi-type provider to be registered once per type.

`VoucherTypeDefinition.numberingSeries` is a **hint string only**. This application already
has a real numbering system — `invoice_prefixes` and `next_invoice_number()` in
`sale_rpc.sql`, atomic and FY-scoped. This field must never shadow or duplicate it.

`PostingProviderDefinition.buildJournalEntry` is **carried, type-checked when supplied, and
invoked by nothing in 15A.** Milestone 15B is its caller. This follows the same
declared-but-unwired pattern reporting's `requiredCapability` (ADR-0003 decision 3), the
Job Engine's unused `CANCELLED` state, and BI's unwired `DashboardCardProvider` already
established; omitting it would force a contract change in the very next milestone.

## 10. Fiscal periods

**`fiscalYear.js` is bug-compatible with Postgres on purpose.** `schema.sql`'s `current_fy()`
uses `(start_y + 1) % 100` with `lpad`, which yields `'2099-00'` for a fiscal year starting
in 2099. That is a latent SQL defect, but JS that disagrees with the database on any date
is a live data-integrity bug — the same invoice would carry two different `fy_label` values
depending on which side computed it. The JS reproduces the SQL faithfully. Fixing the
century-rollover requires changing both sides together in a separate, migration-aware
milestone.

**Three period states**, each earning its place:

| Status | Postable? | Reversible? |
|---|---|---|
| `OPEN` | yes | — |
| `CLOSED` | no | **yes** — the ordinary month/year-end close an accountant routinely reverses to post a late entry |
| `LOCKED` | no | **no** — terminal, post-audit or post-statutory-filing |

`toReopened()` on a `LOCKED` period throws: a UI should never offer that button, so calling
it is a programmer error, not user input.

Transitions are pure (`deepFreeze({ ...period, status })`), following
`reporting/lifecycle/reportLifecycle.js`'s idiom. `fiscalPeriodService`'s
`close`/`reopen`/`lock` never mutate a period — they rebind the Map slot to a new frozen
object.

`register()` rejects a period overlapping an existing one in the same fiscal year: two
overlapping open periods would make `findPeriodForDate()` non-deterministic. `canPostOn()`
**fails closed** — `false` when no period is registered for the date.

## 11. Extension points

**The three shared registries are this platform's extension points**, exactly as
`reportRegistry.register(definition)` is the Reporting Platform's (ADR-0003 decision 2). A
future module contributes an account, voucher type, or posting provider by calling
`register()` on the shared instance `index.js` exports. No change to this platform, and no
change to the frozen Extension Framework, is required.

No `accountingExtensionHost.js` exists and none should be built — "never create another
extension engine" is an explicit constraint, and reporting's own precedent for
registry-as-extension-point is the sanctioned pattern. No capability name was added to
`js/services/extensions/capabilityNames.js` either; that file lives inside the frozen
Extension Framework, and wiring that specific integration remains deferred exactly as
Milestone 14A deferred it.

## 12. Events, Diagnostics, and Audit

**Events — contracts declared, nothing published.** Milestone 15A added one aggregate
(`accounting`) and five event contracts to `events/registry/eventTypes.js`, plus matching
audit record versions in `audit/registry/auditRegistry.js`:

| Event type | Published by |
|---|---|
| `JournalEntryPosted` | Milestone 15B |
| `JournalEntryReversed` | Milestone 15B |
| `FiscalPeriodClosed` | Milestone 15B |
| `FiscalPeriodReopened` | Milestone 15B |
| `FiscalPeriodLocked` | Milestone 15B |

**15A publishes none of them**, and nothing under `js/services/accounting/**` imports
`events/`. The contracts are declared now because an event type is part of that catalog's
own additive contract and a future posting operation should not need to touch that file to
become publishable.

Registration-time events (an account or posting provider being registered) are
**deliberately absent**: they are platform lifecycle, not business facts — the same
reasoning that kept Milestone 14A at zero event types. Publication begins in 15B, when a
journal is actually posted or a period actually closed.

**Diagnostics — deliberately not consumed.** Reporting built a `reportContext.js` because
report *screens* needed a logger and trace context. Nothing in this platform runs, so an
`accountingContext.js` would have zero call sites and would break the zero-external-import
property. Milestone 15B's posting pipeline is the right place to add one, following
`reportContext.js`'s exact shape.

**Audit — integration point, no implementation.** The audit record versions above are the
integration point. When 15B publishes `JournalEntryPosted`, the already-existing
`auditSubscriber` observes it like any other event. No file here imports `audit/`, writes
an audit record, or starts the subscriber — the same indirect pattern
`businessIntelligence/audit/biAuditReporter.js` uses.

## 13. Current call sites

**As of 15A: none.** Zero files outside `js/services/accounting/**` imported this
platform, and zero files inside it were imported by anything else. The only exerciser was
`accountingPlatform.test.html` (116 checks).

**As of 15B:** `js/sales.js`, `js/purchases.js`, and `js/manufacturing.js` each call
`AccountingPlatform.post()` (and only that — never a provider, registry, or the resolver
directly) as a second, best-effort step after their own RPC succeeds.
`sale.html`/`purchase.html`/`manufacturing.html` each additionally import and call their
own `registerXPostingProvider()` at load, and surface a posting failure via
`describePostingFailure()`. `js/services/accounting/posting/postingPipeline.test.html`
(45 checks) exercises the posting façade, providers, and resolver against injected mocks.

**As of 15C:** `js/manualJournal.js` and `journal.html` add a fourth
`AccountingPlatform.post()` caller, following the same shape — `journal.html` registers
`manualJournalPostingProvider`, `js/manualJournal.js` calls only the façade.
`postingPipeline.test.html` gained 8 more checks for the new provider (53 total); the
same-day Purchase Posting hotfix added 6 more (59 total).

**As of 15D:** the platform's first **read-only** consumer.
`js/journalRegisterData.js` itself imports nothing from `index.js` — only `supa`/
`getActiveCompanyId` from `supabaseClient.js`. `journal-detail.html` is the one that
imports `computeEntryTotals()`/`isBalanced()`/`toMinorUnits()` from `index.js` directly, to
reuse the balanced-entry math for display. Neither file calls `AccountingPlatform.post()`,
touches `postingProviderRegistry`, or writes anything. No new checks in
`postingPipeline.test.html` (nothing in the posting pipeline changed); 15D was verified by
live staging validation instead, the same way 15C's own UI was.

**As of 15E:** a second **read-only** consumer, this time not against
`js/services/accounting/**` at all but against `v_journal_ledger_lines` (`schema.sql`
§29, ADR-0012) — a database view, not a module import. `js/ledgerData.js` imports only
`supa`/`getActiveCompanyId` from `supabaseClient.js`, the same shape
`journalRegisterData.js` already established; `ledger.html` imports only `ledgerData.js`
and `searchAccounts` from `js/manualJournal.js` (the same account-picker reuse
`journal-register.html` already established in 15D — a second consumer, not a
duplicate). Neither file calls `AccountingPlatform.post()`, touches
`postingProviderRegistry`, or writes anything — to `journal_entries`/`journal_lines`/
`accounts` or to the view. No new checks in `postingPipeline.test.html` (nothing in the
posting pipeline changed); 15E was verified by live staging validation instead, the same
way 15C/15D's own UI was.

**As of 15F:** a third **read-only** consumer, composing on the same 15E surface rather
than adding a new one. `js/trialBalanceData.js` imports only `balanceAt()` and
`bucketSignedBalance()` from `js/ledgerData.js` (both promoted from private to exported
for this reuse) plus `supa`/`getActiveCompanyId` from `supabaseClient.js` — no new
database object, no import of `index.js`. `trial-balance.html` imports
`trialBalanceData.js` and, directly, `rowsToCsv`/`downloadCsv` from the Reporting
Platform's standalone `export/csvExport.js` (zero coupling to the Report Registry/
Lifecycle/shell — the same direct-reuse pattern `journal-detail.html` already
established for `computeEntryTotals()`/`isBalanced()`). `ledger.html` gained one small,
additive capability for this milestone: an optional `?account=<id>` URL parameter,
mirroring `journal-detail.html`'s own `?id=` contract, so Trial Balance can drill down
into a pre-selected account; the screen is unchanged when the parameter is absent. Every
Trial Balance figure is computed by a bounded, parallel fan-out of `balanceAt()` calls —
one per account in the company's chart of accounts — never a new SQL view or RPC; see
ADR-0013 for the architecture review that ruled out every single-query alternative.
Unlike 15D/15E, 15F ships a dedicated offline test file
(`js/trialBalanceData.test.html`, 21 checks) for its own new pure logic
(`buildTrialBalanceRows()`/`bucketSignedBalance()` bucketing and grand-total math);
`postingPipeline.test.html` still gained none, since nothing in the posting pipeline
changed. 15F was additionally verified by live staging validation, confirming the grand
total's debit/credit tie-out and correct historical as-of-date behavior against real data.

The files this platform's own milestones modified outside `js/services/accounting/**` —
`events/registry/eventTypes.js`, `audit/registry/auditRegistry.js` (15A, additive-only),
and the ERP files named above (15B/15C/15D/15E/15F) — are not imported *by* accounting;
the import direction stays one-way.

## 14. How to extend this platform (Milestone 15B and beyond)

**Register an account**: `createAccountDefinition({...})` then
`accountRegistry.register(definition)`. Register parents before children. Use a category in
the derivation table, or declare `normalBalance` explicitly.

**Add a new account category or type**: just use the new string — both are open catalogs.
If it needs a normal-balance default, add it to `NORMAL_BALANCE_BY_CATEGORY` in
`accountContract.js`; otherwise every account in it must declare `normalBalance`.

**Register a voucher type / posting provider**: same pattern against
`voucherTypeRegistry` / `postingProviderRegistry`.

**Build and validate a journal entry**: `createJournalEntry({...})` for shape, then
`validateJournalEntry(entry, { accountRegistry, fiscalPeriodService })` for correctness, or
`assertBalancedJournalEntry(entry, options)` to fail fast.

**Add a new validation rule**: add a code to `JOURNAL_ERROR_CODES`, a granular finder
function, and a branch in `validateJournalEntry`'s composer. Keep the finder private unless
a real consumer needs it (§3).

**Add a public export**: only when a real consumer needs it. Adding is non-breaking;
removing is not.

## 15. Future milestones

**Milestone 15B (Journal Engine) is complete** (this section previously described it as
scoped-but-unbuilt; corrected here rather than in a follow-up commit, per this
repository's "roadmap updates ride in the milestone PR" convention). It shipped
deliberately narrower than the full list 15A's own brief named for it — mirroring the
Reporting Platform's own 14A→14B→14C decomposition rather than building every accounting
workflow at once. A transaction-flow audit (`docs/reports/milestone-15A-completion.md`
§20, plus a further audit against `sale_rpc.sql`/`manufacturing_rpc.sql`/`stock_rpc.sql`)
found Sales and Purchase RPCs return no money at all (the caller already holds the full
computed totals), Manufacturing's return alone is a complete self-balancing entry, and
stock adjustments carry no cost data whatsoever. That shaped the scope decision. §§1–14
above describe the resulting architecture (`posting/`, `providers/`, `resolution/`) as
built; this section keeps only the scope record and what's still deferred.

**Shipped in 15B:**

- The **Accounting Platform public posting API** — `AccountingPlatform.post()`/`.reverse()`
  (`posting/postingFacade.js`), the *only* thing Sales, Purchase, and Manufacturing ever
  call. It resolves the correct posting provider, validates, invokes it, and returns
  success/failure; callers never touch `postingProviderRegistry` or a provider directly,
  and never learn which provider ran. Domain events remain notifications, never posting
  triggers.
- The posting pipeline and the persisted schema (`accounts`, `fiscal_periods`,
  `journal_entries`, `journal_lines`, `accounting_settings`, `journal_number_counters` in
  `schema.sql`; `post_journal_entry()`/`reverse_journal_entry()`/`next_journal_number()`
  in `accounting_rpc.sql`) — the only write path, RLS is select-only for clients on every
  one of these tables.
- Automatic posting providers for **Sales, Purchase, and Manufacturing only** — the three
  domains with fully computable money today.
- **Journal reversal by journal entry id**, as a standalone accounting capability with no
  ERP-side trigger — no `cancel_sale`/`delete_purchase` RPC exists anywhere in this
  codebase. A future ERP cancellation workflow becomes a consumer of this reversal API,
  not a prerequisite for it.

**Not shipped in 15B, still not built:** import posting through the façade
(`postingSource: 'import'`) and any queue/batch integration with the Background Job
Platform (11D) — no measured performance problem has motivated either yet.

**Milestone 15C (Manual Journal Engine) is complete and merged.** It added
`providers/manualJournalPostingProvider.js`, registered for `VOUCHER_TYPES.JOURNAL`:
unlike every 15B provider, it resolves no business role — the lines it builds already
carry real `accountId`s a user chose directly (`journal.html`'s own account picker, a
direct read of `accounts`), so `buildJournalEntry()` is a pass-through. No schema or RPC
change: the persisted schema already anticipated this case
(`journal_entries.ref_table`/`ref_id` are nullable specifically for manual journals and
reversals; `post_journal_entry()`'s payload comment already lists `"journal"` as a valid
`voucher_type`). A separate, same-day hotfix (`purchasePostingProvider.js` +
`postingFacade.js`) fixed a pre-existing 15B defect found during 15C's own production
readiness review: a blank Purchase Bill Number produced an empty-string `reference` that
`createJournalEntry()` correctly rejected, but the resulting exception escaped
`postingFacade.js`'s `post()` uncaught (only `buildJournalEntry()` was try/caught) and
surfaced as a false "Save failed" even though the purchase itself had committed.
`postingFacade.js`'s `createJournalEntry()` call is now wrapped the same way, returning
`VALIDATION_FAILED` like every other malformed-entry case — protecting every posting
provider, not just Purchase.

**Milestone 15D (Journal Inquiry Platform) is complete and merged.** It is
**read-only**: zero changes to `posting/`, `providers/`, `resolution/`, `contracts/`,
`registry/`, `validation/`, `fiscal/`, `schema.sql`, `accounting_rpc.sql`, or RLS. Two new
screens (`journal-register.html`, `journal-detail.html`) and one new data-access module
(`js/journalRegisterData.js`, flat under `js/`, following the same ADR-0004/ADR-0005
conventions `salesRegisterData.js`/`purchaseRegisterData.js` already established, though
not registered as a Reporting Platform report — this milestone's own brief: "DOES NOT
create financial reports," and the Reporting Platform's shell has no row-click/drill-down
pattern anywhere in its 23 registered reports to build on). `journal-register.html`/
`journal-detail.html` never query Supabase directly; every read goes through
`journalRegisterData.js`. The Journal Detail's balanced indicator reuses
`computeEntryTotals()`/`isBalanced()` (already public on `index.js`) rather than
re-deriving a sum. Deep-link navigation to the original Sale/Purchase/Manufacturing record
is deliberately out of scope: no such single-record viewer exists anywhere in this app for
any entity today, and the Accounting Inquiry Platform exposes accounting provenance
(voucher type, reference, source table, source record id — plain read-only text) without
owning operational record navigation; that's deferred to a future cross-module navigation
milestone, which Journal Detail can integrate with later without any schema or journal
change.

**Milestone 15E (General Ledger Platform) is complete.** It is **read-only**, same
posture as 15D: zero changes to `posting/`, `providers/`, `resolution/`, `contracts/`,
`registry/`, `validation/`, `fiscal/`, `accounting_rpc.sql`, or RLS. The one schema change
is additive and non-destructive — one new view, `v_journal_ledger_lines` (`schema.sql`
§29), not a table, not a migration of existing data, and no cached/persisted balance
anywhere (ADR-0012 records why a view, not a `security invoker` RPC, is this codebase's
right shape for this — PostgREST aggregate functions are confirmed disabled on this
project, and a plpgsql function body would be a planner optimization barrier a plain view
is not). Live validation caught a real defect in the view's first draft: without an
explicit `security_invoker = true`, the view ran as its Supabase-SQL-Editor owner
(`postgres`, BYPASSRLS) rather than the querying role, and an anonymous, unauthenticated
request returned every company's ledger lines. Fixed by adding `security_invoker = true`
to the view definition and re-verified live (anon request now returns zero rows, matching
the base tables) — see ADR-0012 for the full account. One new screen (`ledger.html`) and
one new data-access module
(`js/ledgerData.js`, flat under `js/`, mirroring `journalRegisterData.js`'s own shape) —
neither registered as a Reporting Platform report, for the same reason 15D's screens
weren't. `ledger.html` shows one account's full transaction history at a time (an account
picker reusing `js/manualJournal.js`'s `searchAccounts()`, the same reuse
`journal-register.html` already established), with opening/running/closing balance —
every balance value comes straight from the view's own `running_balance` column;
`js/ledgerData.js` and `ledger.html` compute no balance arithmetic of their own, only
presentation (which side — Dr/Cr — a signed value reads as, per §4). Opening and closing
balance are computed against the account's complete history bounded only by the date
window, deliberately unaffected by the voucher-type/posting-source/search row-display
filters — see ADR-0012 and `js/ledgerData.js`'s own header comment for why a filtered view
of *which rows are shown* must not change *what balance those rows are shown against*.
Live validation also caught a second real defect, this one client-side: `getLedgerPage()`
originally computed opening balance by querying "the latest running_balance before
`dateFrom`" unconditionally, which for the common case of no `dateFrom` filter at all
degenerated into "the latest running_balance, period" — silently showing the account's
current balance as its *opening* balance instead of zero. Fixed by short-circuiting to 0
when `dateFrom` is unset, with the reasoning recorded inline at the fix site.

**Milestone 15F (Trial Balance Platform) is complete.** Same **read-only** posture as
15D/15E: zero changes to `posting/`, `providers/`, `resolution/`, `contracts/`,
`registry/`, `validation/`, `fiscal/`, `accounting_rpc.sql`, or RLS — and, unlike 15E,
**zero schema change of any kind**: no new table, view, or RPC. A dedicated
architecture review (documented in full in ADR-0013) first evaluated every plausible
single-query approach — `DISTINCT ON`, ranking window functions, `GROUP BY` with a
join-back, `LATERAL` joins, CTEs — for computing "every account's balance as of a
selectable date" in one request, and proved each one incorrect for an arbitrary
*historical* date: all of them pick one row per account before a client-supplied date
filter can apply, and PostgREST has no mechanism to inject that filter earlier. The one
single-query shape that *is* correct requires a parameterized stored function (an RPC),
which this milestone's scope excludes. Trial Balance therefore composes via a bounded,
parallel fan-out — one call to `js/ledgerData.js`'s existing `balanceAt()` per account in
the company's chart of accounts (typically tens for an SMB, not transaction volume) —
reusing the exact function 15E already proved correct for a historical date, owing to
`running_balance` being a prefix sum rather than a row-pick. `trial-balance.html` shows
every account's balance as of a selectable date, bucketed into a Debit or Credit column
via the shared, pure `bucketSignedBalance()` (promoted out of `ledger.html` into
`js/ledgerData.js` so neither screen duplicates the bucketing logic), with grand totals
that tie out (debit total = credit total) as a direct, unre-validated consequence of
`post_journal_entry()`'s own balance guarantee. It is a standalone Accounting screen —
not registered on the Reporting Platform — reached from `menu.html`'s Accounting section,
with CSV export wired directly via the Reporting Platform's standalone
`export/csvExport.js` utilities and drill-down into `ledger.html?account=<id>` for a
selected account's full history. Unlike 15D/15E, this milestone's new pure logic
(bucketing, grand totals) has a dedicated offline test file,
`js/trialBalanceData.test.html` (21 checks) — that file's own header comment records
exactly what it does and does not cover, since the SQL-level as-of-date correctness
itself rests on `balanceAt()`'s already-proven prefix-sum property (ADR-0013), not on
anything a pure unit test can exercise.

**Explicitly deferred to future, independently-scoped sub-milestones (15G+):** Profit &
Loss, Balance Sheet — each composes on `v_journal_ledger_lines`/`balanceAt()` per
ADR-0012/ADR-0013 rather than re-deriving running balance, but each is its own screen,
its own data shape, and its own milestone. Also still deferred: Posting Preview, Posting
History, Posting Approval, Recurring Journals, persisted draft support for manual
journals (`journal_entries` has no draft/status column and no draft-write RPC to model
one on today), and cross-module deep-link navigation from Journal Detail to Sales/
Purchase/Manufacturing records — each a distinct workflow, UI, persistence shape, or
scheduling concern that does not belong bundled into 15B's automatic-posting slice, 15C's
manual-entry slice, 15D's read-only inquiry slice, 15E's ledger-view slice, or 15F's
trial-balance slice.

**Explicitly deferred indefinitely, pending a separate decision:** stock adjustment
posting. Double-entry accounting requires financial value, not just quantity; this
platform will not fabricate a costing methodology to manufacture one where none exists.

Deliberately **not** built in 15A, and the reasons: see
`docs/reports/milestone-15A-completion.md` §"Deliberately omitted". Headline items — an
accounting context/logger (nothing runs yet), accounting permissions (no repository-wide
permissions framework exists).

Still unresolved, carried forward: there is no authorization model anywhere in this
application; `createdBy` and reporting's `requiredCapability` both remain carried and
unenforced.
