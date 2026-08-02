# Milestone 15A Completion Report — Accounting Platform Foundation

**Status: Complete.** A new, ninth infrastructure-style platform, `js/services/accounting/`,
sibling to `events/`, `diagnostics/`, `jobs/`, `audit/`, `extensions/`,
`businessIntelligence/`, `dataExchange/`, and `reporting/`. Foundation only — zero
consumers, zero persistence, zero UI, zero schema change. Full regression unchanged from
the 14C baseline: **1540/1540 across all 22 existing suites**, plus **116/116** in the new
`accountingPlatform.test.html`.

---

## 1. Repository Audit Summary

Before any code was written, a full-repository sweep searched for existing accounting
infrastructure: Chart of Accounts, account registry, journal model, posting engine, posting
rules, fiscal year/period, accounting context, financial period, voucher models, ledger
models, financial services, balance services, accounting validation, posting validation,
financial events, accounting extension points, accounting permissions.

**Result: none exists.** Every apparent hit was a false positive:

| Apparent hit | Reality |
|---|---|
| `stock_ledger` (`schema.sql:201`) | Quantity movements (`qty_in`/`qty_out`), no money, no account dimension |
| `*Voucher*.js` under `js/services/dataExchange/xml/` | Tally wire-format vocabulary, Sales-only, no posting logic |
| `groupClassifier.js` | Reads *Tally's* chart of accounts, collapses it to `customer\|supplier\|null` |
| "Customer/Supplier Ledger" reports (`report-catalog.md`) | Registry **aliases** onto Sales/Purchase Register, not a real ledger |
| `audit_log` table | An immutable change log, not a journal |
| `transactionEngine.js` | Import/export commit-rollback, not a financial transaction |

**Reusable assets found and reused, never duplicated:**

- **`js/gst.js`** — the repository's only money math. `shared/money.js` converges on its
  rounding, deliberately diverges on its `null`/`NaN` → `0` swallow (§8, ADR-0008).
- **`schema.sql:537` `current_fy(_dt, _fy_start_month)`** — `fiscal/fiscalYear.js`
  reproduces it character-for-character, including its `(start_y+1)%100` edge behaviour.
- **`companies.fy_start_month`** — confirmed per-company (a test fixture uses `1`, not the
  documented default `4`), which is why `fiscalPeriodService` is not a singleton (§5).
- **`js/services/reporting/**`** — the platform-construction idiom mirrored throughout
  (closure factories, no classes, `createXDefinition` + private field-assert + exported
  structural-assert, six-method Map registries, frozen enums, spread-then-freeze
  transitions, `//`-block headers).
- **`extensions/validation/dependencyValidator.js`** — the granular-rules-composed-into-
  `{ isValid, errors }` pattern, reused for `validateJournalEntry()`.

**Two governance documents were found in direct or partial conflict, both surfaced and
resolved explicitly before implementation, not silently:**

- `docs/milestone-8.1-ux-architecture.md` §1: *"What ApnaBill is not: it is not accounting
  software, not a general ERP."* Resolved by **ADR-0007**: the historical document is
  never rewritten; the statement is recorded as superseded by the accumulated direction of
  Milestones 12A–15A.
- `docs/architecture/platform-roadmap.md` had not been updated for Milestone 14C at all
  before this milestone began. Brought current in this same milestone (§6 below).

## 2. Architecture Overview

```
ERP -> Business Intelligence -> BusinessSnapshot -> Executive Command Center (13C)
ERP -> Infrastructure (Events / Diagnostics / Jobs / Audit / Extensions)
ERP -> Reporting Platform (14A -> 14B -> 14C) -> Reports hub
ERP -> Accounting Platform (15A, foundation only) -> real posting (15B+)
```

**Zero imports outside `js/services/accounting/`** — stronger than reporting's own claim
(reporting imports `diagnostics/` and `supabaseClient.js`). Confirmed by grep before every
commit. Nothing under `js/services/accounting/**` imports `reporting/`,
`businessIntelligence/`, `events/`, `jobs/`, `audit/`, `extensions/`, `dataExchange/`,
`diagnostics/`, `js/ui/**`, `supabaseClient.js`, or `gst.js`. Nothing outside the platform
imports from it — zero consumers is the entire point of a foundation milestone.

Full architecture reference: `docs/architecture/accounting-platform-architecture.md`.

## 3. Chart of Accounts Architecture

`contracts/accountContract.js` + `registry/accountRegistry.js`. An `AccountDefinition`
carries `id`, `code`, `name`, `category`, `type`, `normalBalance`, `parentId`,
`isReserved`, `status`, `description`, `metadata` — deep-frozen, no balance, no ledger.

**Open catalogs, closed derivation table (ADR-0010).** `ACCOUNT_CATEGORIES`/`ACCOUNT_TYPES`
validate as non-empty strings, not membership, extending `reportContract.js`'s own
precedent. `deriveNormalBalance(category)` is a closed table underneath that open catalog;
`gst`/`suspense`/`control` are deliberately absent (their normal balance is genuinely
ambiguous), so an account in any of those three — or any future custom category — must
declare `normalBalance` explicitly or construction throws.

**Declared ≠ derived is legal**: contra accounts (Accumulated Depreciation, Sales Returns)
register cleanly; `isContraAccount()` exposes the distinction.

## 4. Account Registry Design

Six-method Map closure (`register`/`get`/`list`/`has`/`unregister`/`clear`), plus:
`getByCode()`, `listByCategory()`, `listChildren()`. Three deliberate additions over the
base idiom: duplicate `code` rejection, a `parentId`-must-already-be-registered rule (which
makes a hierarchy cycle **impossible by construction** — no cycle detector needed, unlike
`extensions`' `detectCircularDependency()`), and `list()` sorted by `code` numerically
rather than by name.

## 5. Journal Contract Design

`contracts/journalContract.js`. **Two non-negative fields, `debit`/`credit`, not one signed
amount (ADR-0009)** — a signed zero cannot distinguish "unfilled" from "zero," the sign
convention would become tribal knowledge, and the shape maps directly onto a future
`check ((debit = 0) <> (credit = 0))` column constraint. Each line stores both a rupee view
and a canonical integer-paise view (`debitMinor`/`creditMinor`), computed once and frozen.
Negative amounts are rejected outright.

**`createJournalEntry()` does not check balance.** The factory guarantees shape;
`validateJournalEntry()` guarantees correctness — a deliberate split (§7) so an unbalanced
draft can still be constructed, held, and rendered by a future UI.

`voucherType` (document class) and `postingSource` (who produced the lines) are distinct
fields on purpose: a manual journal and a system-generated adjustment journal are the same
`voucherType` with very different audit weight.

## 6. Posting Registry Architecture

`contracts/postingProviderContract.js` + `registry/postingProviderRegistry.js`. Registration
only — `buildJournalEntry` is carried, type-checked when supplied, and invoked by **nothing**
in this milestone; Milestone 15B is its caller. This follows the repeated
declared-but-unwired pattern this codebase already uses three times (reporting's
`requiredCapability`, the Job Engine's unused `CANCELLED` state, BI's unwired
`DashboardCardProvider`).

`findProvidersForVoucherType()` — modeled on `capabilityRegistry.js` and **deliberately
dumb**: returns a possibly-multi list, never ranks, never auto-resolves "the" provider.
Conflict resolution is a 15B posting-pipeline decision.

## 7. Validation Framework

**Contract construction throws; business-rule validation returns `{ isValid, errors }`
(ADR-0011).** The two live precedents in this repository (every contract factory throws;
`dependencyValidator.js` returns a result) are reconciled by kind of failure, not
arbitrarily picked: a malformed definition is a programmer error, an unbalanced voucher is
ordinary user input that fails several rules at once and needs machine-mappable codes.
`assertBalancedJournalEntry()` bridges the two.

Codes: `MINIMUM_LINES`, `LINE_SIDE_MISSING`, `LINE_SIDE_BOTH`, `NEGATIVE_AMOUNT`,
`UNBALANCED`, `DUPLICATE_ACCOUNT`, `UNKNOWN_ACCOUNT`, `INACTIVE_ACCOUNT`,
`PERIOD_NOT_OPEN`, `DATE_OUTSIDE_PERIOD`. Duplicate accounts are **allowed by default**
(a payment voucher legitimately settles two invoices against one party account).
`accountRegistry`/`fiscalPeriodService` are optional, null-by-default collaborators — the
validator works on a bare entry with neither.

**Balance correctness itself rests on ADR-0008**: integer minor units (paise), exact
integer `===`, no epsilon anywhere in the balance path — rejecting the 0.5-rupee-tolerance
pattern already live in `xmlBusinessRules.js`.

## 8. Voucher Infrastructure

`contracts/voucherTypeContract.js` + `registry/voucherTypeRegistry.js`. Metadata and
discovery only. **Voucher types and posting providers are two registries, not one**,
because the relationship is many-to-one *and* partial: one provider can produce several
voucher types, and a manual `journal` voucher type has no provider at all. `list()` sorts
by name (no code-ordering convention exists for voucher types, unlike accounts).
`numberingSeries` is a hint string only — the real numbering system remains
`invoice_prefixes`/`next_invoice_number()` in `sale_rpc.sql`, untouched.

## 9. Fiscal Period Architecture

`fiscal/fiscalYear.js`, `fiscal/fiscalPeriodContract.js`, `fiscal/fiscalPeriodService.js`.
FY label derivation is **bug-compatible with Postgres on purpose** — reproducing
`current_fy()`'s `(start_y+1)%100` edge behaviour rather than silently fixing it, because
disagreeing with the database on any date would be a live data-integrity bug.

**Three period states**: `OPEN` (postable), `CLOSED` (not postable, reopenable — the
ordinary month-end close), `LOCKED` (not postable, terminal — post-audit/filing;
`toReopened()` on a locked period throws). Transitions are pure, following
`reportLifecycle.js`'s idiom.

**`fiscalPeriodService` is deliberately not a singleton** — `fyStartMonth` is per-company,
confirmed by an existing test fixture using `1` rather than the documented default `4`. A
shared instance would silently mislabel one company's fiscal years with another's
calendar. `register()` rejects overlapping periods in the same fiscal year;
`canPostOn()` fails closed.

## 10. Extension Integration

**The three shared registries (`accountRegistry`, `voucherTypeRegistry`,
`postingProviderRegistry`) are this platform's extension points**, exactly as
`reportRegistry.register()` is the Reporting Platform's own (ADR-0003 decision 2 reused,
not re-derived). No `accountingExtensionHost.js` was built, and none should be — a second
extension engine is explicitly forbidden. No capability was added to the frozen
`js/services/extensions/capabilityNames.js`; that integration remains deferred exactly as
14A deferred it.

## 11. Event Integration

Five event contracts added additively to `events/registry/eventTypes.js`
(`JournalEntryPosted`, `JournalEntryReversed`, `FiscalPeriodClosed`,
`FiscalPeriodReopened`, `FiscalPeriodLocked`), plus one new aggregate (`accounting`), plus
matching audit record versions in `audit/registry/auditRegistry.js`. **Zero events are
published anywhere in this milestone** — nothing under `js/services/accounting/**` imports
`events/`. Registration-time events (an account being registered) were deliberately
excluded: they are platform lifecycle, not business facts, the same reasoning that kept
Milestone 14A at zero event types. Publication begins in Milestone 15B, the first milestone
in which a journal entry is actually posted or a fiscal period is actually closed.

## 12. Diagnostics Integration

**None, deliberately.** Reporting built `reportContext.js` because report *screens* needed
a logger and trace context. Nothing in this platform runs, so an `accountingContext.js`
would have zero call sites and would also break the platform's zero-external-import
property (it would need to import `diagnostics/`). This is flagged as an intentional
omission, not an oversight — see §14.

## 13. Audit Integration

**Integration point only, no implementation.** The audit record versions added in §11 are
the hook: when Milestone 15B eventually publishes `JournalEntryPosted`, the
already-existing `auditSubscriber` observes it like any other event, the same indirect
pattern `businessIntelligence/audit/biAuditReporter.js` already uses. No file under
`js/services/accounting/**` imports `audit/`, writes an audit record, or starts the
subscriber.

## 14. Shared Modules Created

`shared/freezeDeep.js`, `shared/generateId.js` — own copies of the canonical primitives,
per this codebase's "never reach into another platform's `shared/`" convention.
`shared/isoDate.js` — `'YYYY-MM-DD'` format + real-calendar validation, shared by the
journal and fiscal-period contracts (two consumers, this repository's own threshold for
extraction). `shared/money.js` — the integer-minor-units primitive (ADR-0008), the
platform's single most load-bearing file.

**Deliberately not created**: `shared/now.js`. Nothing in this platform times a run or
duration — every sibling platform that has one built it for a lifecycle this platform does
not have.

## 15. Files Added

**17 new files under `js/services/accounting/`:**

```
index.js
shared/{freezeDeep,generateId,isoDate,money}.js
contracts/{accountContract,journalContract,voucherTypeContract,postingProviderContract}.js
registry/{accountRegistry,voucherTypeRegistry,postingProviderRegistry}.js
validation/{validationResult,journalEntryValidator}.js
fiscal/{fiscalYear,fiscalPeriodContract,fiscalPeriodService}.js
accountingPlatform.test.html
```

**New documentation (7 files):** `docs/architecture/accounting-platform-architecture.md`;
five ADRs, `docs/architecture/ADR/0007-apnabill-scope-evolution-to-full-erp.md` through
`0011-accounting-validation-throw-vs-result.md`; this completion report.

## 16. Files Modified

**Additive only (2 files):**

- `js/services/events/registry/eventTypes.js` — +1 aggregate (`accounting`), +5 event
  contracts. No change to `bus/eventBus.js`, `contracts/eventEnvelope.js`, or
  `context/eventContext.js`, per that file's own documented additive rule.
- `js/services/audit/registry/auditRegistry.js` — +5 matching audit record versions.

**Additive only (docs, 3 files):** `docs/architecture/ADR/README.md` (+5 index rows),
`docs/architecture/platform-roadmap.md` (§3/§4/§6/§7/§8 — brought current for Milestone
14C, which had not been reflected there at all, plus the new 15A entries), and
`docs/releases/accounting-platform-foundation-v1.0.md` (new release checkpoint).

**Untouched everywhere in this milestone:** `schema.sql`, `js/gst.js`, every existing
screen, `js/ui/**`, `css/**`, every other platform's internals
(`js/services/{reporting,businessIntelligence,jobs,diagnostics,extensions,dataExchange}/**`
apart from the two additive registry files above), and
`docs/milestone-8.1-ux-architecture.md` (per explicit instruction — see ADR-0007).

## 17. Architectural Decisions Made

Recorded in five new ADRs:

1. **ADR-0007** — ApnaBill's scope has evolved into a full ERP platform across Milestones
   12A–15A; `milestone-8.1-ux-architecture.md` §1's "not accounting software" statement is
   superseded, without rewriting that historical document.
2. **ADR-0008** — Money is compared in integer minor units; the balance check has no
   epsilon; sub-paise precision is rejected, never silently rounded.
3. **ADR-0009** — A journal line carries two non-negative amount fields with an XOR
   invariant, not one signed amount.
4. **ADR-0010** — Account category/type catalogs stay open; normal-balance derivation
   stays closed, with `gst`/`suspense`/`control` deliberately excluded.
5. **ADR-0011** — Contract construction throws; business-rule validation returns
   `{ isValid, errors }`.

## 18. Deliberately Omitted

Per an explicit scope-discipline decision made before implementation: no placeholder
module with no executable responsibility in this milestone was created, even where the
original brief's suggested structure named one.

| Omitted | Why |
|---|---|
| `posting/postingPreview.js` | Explicitly Milestone 15B scope, per the brief's own boundary |
| `posting/postingContext.js` | A posting execution context for an operation this milestone does not perform |
| `permissions/accountingPermissions.js` | No repository-wide permissions framework exists to integrate with |
| `context/accountingContext.js` | Nothing in this platform runs; would also break the zero-external-import property (needs `diagnostics/`) |
| `shared/now.js` | No run/duration lifecycle anywhere in this platform — zero call sites |
| `lifecycle/accountingLifecycle.js` | No run to model; the one real lifecycle (fiscal periods) lives in `fiscalPeriodContract.js` where it belongs |
| `extensions/accountingExtensionHost.js` | The three shared registries already are the extension points (§10); a second extension engine is explicitly forbidden |
| A `ZERO_TOTAL` validator rule | Provably unreachable — the strict `> 0` XOR already errors any all-zero line before balance is checked |
| Registration-time events (`AccountRegistered`, etc.) | Platform lifecycle, not business facts — see §11 |
| Trial balance, ledger balances, running balances, GL, financial statements | Explicitly out of scope for this milestone by the brief's own "DO NOT BUILD" list |

All are deferred to Milestone 15B or a later, separately-authorized milestone — none is a
gap discovered late; every one was identified before implementation began.

## 19. Regression Validation

**1540/1540 passing across all 22 pre-existing suites, unchanged from the 14C baseline** —
re-verified via this repository's documented zero-build method
(`python -m http.server` + headless Chrome `--headless=new --dump-dom`) immediately before
this milestone was finalized:

| Suite | Result | Suite | Result |
|---|---|---|---|
| `audit/audit.test.html` | 62/62 ✅ | `dataExchange/xml/xmlExport.test.html` | 77/77 ✅ |
| `businessIntelligence/businessDashboard.test.html` | 40/40 ✅ | `dataExchange/xml/xmlImport.test.html` | 87/87 ✅ |
| `businessIntelligence/businessIntelligence.test.html` | 128/128 ✅ | `diagnostics/diagnostics.test.html` | 68/68 ✅ |
| `businessIntelligence/pricingIntelligence.test.html` | 80/80 ✅ | `events/eventBus.test.html` | 58/58 ✅ |
| `businessIntelligence/purchaseIntelligence.test.html` | 95/95 ✅ | `extensions/extensionFramework.test.html` | 64/64 ✅ |
| `businessIntelligence/salesIntelligence.test.html` | 90/90 ✅ | `jobs/jobEngine.test.html` | 54/54 ✅ |
| `businessIntelligence/supplierIntelligence.test.html` | 59/59 ✅ | `reporting/reportingPlatform.test.html` | 67/67 ✅ |
| `dataExchange/apnabill/apnabill.test.html` | 52/52 ✅ | `ui/forms/forms.test.html` | 80/80 ✅ |
| `dataExchange/apnabill/apnabillRestore.test.html` | 72/72 ✅ | `ui/uiFoundation.test.html` | 99/99 ✅ |
| `dataExchange/dataExchange.test.html` | 43/43 ✅ | | |
| `dataExchange/json/jsonExport.test.html` | 58/58 ✅ | | |
| `dataExchange/json/jsonImport.test.html` | 59/59 ✅ | | |
| `dataExchange/migration/migration.test.html` | 48/48 ✅ | **Total** | **1540/1540 ✅** |

`events/eventBus.test.html` and `audit/audit.test.html` are the two suites covering the
files this milestone modified (`eventTypes.js`, `auditRegistry.js`) — both unchanged,
confirming the additive event/audit entries introduced zero regression.

**New suite**: `js/services/accounting/accountingPlatform.test.html`, **116/116 passing**,
importing exclusively through `index.js`'s public surface. Covers, among others: `0.1 +
0.2` and `1.15` accepted as exact paise, `0.005` rejected; a 3-line float-trap entry
balancing exactly in integer paise; an unbalanced entry reporting `UNBALANCED` and an
independent `UNKNOWN_ACCOUNT` error in one call; `deriveNormalBalance('gst') === null` and
the resulting throw; a contra account accepted; duplicate account code rejected;
unregistered `parentId` rejected; both directions of `resolveFiscalYearLabel` around a
fiscal year boundary; `toReopened` on a `LOCKED` period throwing; overlapping fiscal
periods rejected; two `fiscalPeriodService` instances with different `fyStartMonth`
producing different labels for the same date (proving it is not a singleton).

**Additional verification**: `node --check` against every new `.js` file (17/17 pass);
`accountingPlatform.test.html` returns HTTP 200 under headless Chrome with zero console
errors; grep-confirmed zero imports from `js/services/accounting/**` to any other platform,
and zero imports from any other file into `js/services/accounting/**`.

## 20. Handoff for Milestone 15B

**Not scoped, designed, or started by this milestone** (per the brief's own explicit
boundary): Manual Journal Engine, Automatic Posting, the Posting Pipeline, Voucher
Posting, Reversals, Recurring Journals, Posting Preview, Posting History, Posting
Approval, Journal Persistence.

**What 15B inherits, ready to use:**

- A Chart of Accounts contract and registry that can be populated today —
  `createAccountDefinition()` + `accountRegistry.register()`.
- A journal contract that produces shape-valid, frozen entries —
  `createJournalEntry()` — and a validator that checks accounting correctness against an
  optional live chart and fiscal calendar — `validateJournalEntry()` /
  `assertBalancedJournalEntry()`.
- A posting provider contract with a `buildJournalEntry` slot already declared and
  type-checked, waiting for its first real implementation and its first real caller.
- A fiscal period service per company, ready to have real periods registered against it,
  with `canPostOn(date)` as the exact check a posting pipeline needs before writing
  anything.
- Five event contracts already declared in `events/registry/eventTypes.js` with matching
  audit versions — 15B's posting pipeline publishes them, and the audit trail is already
  wired to listen the moment it does.

**What 15B must still design itself, not inherit**: the actual `journal_entries`/
`journal_lines`/`accounts`/`fiscal_periods` schema (this milestone deliberately made no
schema change); a real posting pipeline that calls `buildJournalEntry` and persists the
result; reversal semantics; recurring-journal scheduling; posting approval/authorization
(there is still no roles/permissions model in this application — `createdBy` remains
carried and unenforced, identical to reporting's `requiredCapability`); and an
`accountingContext.js` following `reportContext.js`'s exact shape, once there is a real
operation for it to log and trace.

**Before Milestone 15B begins**: consult
`docs/architecture/accounting-platform-architecture.md` §14 ("How to extend this
platform") and §15 ("Future milestones"), and re-read ADR-0008/0009/0011 before touching
money or journal-line shape — those three decisions fix the eventual schema and are
expensive to reverse once 15B's persistence layer depends on them.

**Milestone 15A is complete.** No work on Milestone 15B begins until separately
authorized.
