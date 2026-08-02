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

**None.** Zero files outside `js/services/accounting/**` import this platform, and zero
files inside it are imported by anything else. The only exerciser is
`accountingPlatform.test.html` (116 checks).

The two files this milestone modified outside the platform —
`events/registry/eventTypes.js` and `audit/registry/auditRegistry.js` — are additive-only
and are not imported *by* accounting.

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

**Milestone 15B (Journal Engine) is scoped, not yet implemented**, and is deliberately
narrower than the full list 15A's own brief named for it — mirroring the Reporting
Platform's own 14A→14B→14C decomposition rather than building every accounting workflow
at once. A transaction-flow audit (`docs/reports/milestone-15A-completion.md` §20, plus a
further audit against `sale_rpc.sql`/`manufacturing_rpc.sql`/`stock_rpc.sql`) found Sales
and Purchase RPCs return no money at all (the caller already holds the full computed
totals), Manufacturing's return alone is a complete self-balancing entry, and stock
adjustments carry no cost data whatsoever. That shaped the scope decision:

**In 15B:**

- A single **Accounting Platform public posting API** (a façade) — the *only* thing Sales,
  Purchase, and Manufacturing ever call. It resolves the correct posting provider,
  validates, invokes it, and returns success/failure; callers never touch
  `postingProviderRegistry` or a provider directly, and never learn which provider ran.
  Domain events remain notifications, never posting triggers.
- The posting pipeline and the first real schema this platform implies (`accounts`,
  `journal_entries`, `journal_lines`, `fiscal_periods`) — the minimum persistence needed
  to back a stored, reversible journal entry.
- Automatic posting providers for **Sales, Purchase, and Manufacturing only** — the three
  domains with fully computable money today.
- **Journal reversal by journal entry id**, as a standalone accounting capability with no
  ERP-side trigger — no `cancel_sale`/`delete_purchase` RPC exists anywhere in this
  codebase. A future ERP cancellation workflow becomes a consumer of this reversal API,
  not a prerequisite for it.
- Import posts synchronously through the same façade (`postingSource: 'import'`), with the
  immediate-vs-deferred execution strategy encapsulated inside the platform so callers
  never depend on it. No queue is built without a measured performance problem; the
  existing Background Job Platform (11D) is the integration point if one emerges.

**Explicitly deferred to future, independently-scoped sub-milestones (15C+):** Manual
Journal Engine, Posting Preview, Posting History, Posting Approval, and Recurring
Journals — each a distinct workflow, UI, persistence shape, or scheduling concern that
does not belong bundled into the automatic-posting slice above.

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
