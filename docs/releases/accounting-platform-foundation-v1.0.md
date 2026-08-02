# Release: accounting-platform-foundation-v1.0

**Branch:** `milestone-15a-accounting-platform-foundation` · **Date:** 2026-08-02

This is a release checkpoint document, not a design document. It records the state of the
repository at this milestone for anyone picking up work afterward. For full design
rationale, the repository-validation audit, and per-module detail, see
`docs/reports/milestone-15A-completion.md` (the milestone completion document) — not
repeated in full here. `docs/architecture/accounting-platform-architecture.md` remains the
authoritative technical reference, and ADR-0007 through ADR-0011 remain the authoritative
record for this milestone's five architectural decisions.

## Executive Summary

Milestone 15A (Accounting Platform Foundation) is complete. It builds a new,
ninth infrastructure-style platform, `js/services/accounting/`, sibling to `events/`,
`diagnostics/`, `jobs/`, `audit/`, `extensions/`, `businessIntelligence/`, `dataExchange/`,
and `reporting/` — the reusable double-entry accounting architecture every future
accounting feature will plug into. **Foundation only: zero consumers, zero persistence,
zero UI, zero schema change.** A repository audit performed before any code was written
found no existing accounting infrastructure of any kind. Full regression: **1540/1540
passing across all 22 pre-existing suites, unchanged from the 14C baseline**, plus
**116/116** in this milestone's own new test suite.

## Architecture Overview

```
ERP -> Business Intelligence -> BusinessSnapshot -> Executive Command Center (13C)
ERP -> Infrastructure (Events / Diagnostics / Jobs / Audit / Extensions)
ERP -> Reporting Platform (14A -> 14B -> 14C) -> Reports hub
ERP -> Accounting Platform (15A, foundation only) -> real posting (15B+)
```

Every module under `js/services/accounting/` follows the platform-construction idiom
`js/services/reporting/` established: closure factories (no classes), a
`createXDefinition()` factory validating field types and returning a deep-frozen object, a
separately exported `assertValidXDefinition()` structural check, six-method Map-closure
registries, frozen enums, and pure spread-then-freeze lifecycle transitions.
**Zero imports outside `js/services/accounting/`** — stronger than reporting's own
non-dependency claim.

## What This Platform Provides

| Component | Files | Purpose |
|---|---|---|
| Money | `shared/money.js` | Integer-minor-units (paise) representation; the balanced-entry correctness foundation |
| Chart of Accounts | `contracts/accountContract.js`, `registry/accountRegistry.js` | Account definitions, category/type catalogs, normal-balance derivation, hierarchy |
| Journal | `contracts/journalContract.js` | Immutable journal entries and lines — shape only, no persistence |
| Validation | `validation/validationResult.js`, `validation/journalEntryValidator.js` | Balanced-entry and business-rule validation |
| Voucher Types | `contracts/voucherTypeContract.js`, `registry/voucherTypeRegistry.js` | Document-class metadata and discovery |
| Posting Providers | `contracts/postingProviderContract.js`, `registry/postingProviderRegistry.js` | Registration for a future module's posting rule — no posting logic |
| Fiscal Periods | `fiscal/fiscalYear.js`, `fiscal/fiscalPeriodContract.js`, `fiscal/fiscalPeriodService.js` | FY label derivation, period states, per-company period registration |

Full per-module design detail: `docs/architecture/accounting-platform-architecture.md`.

## Repository Validation Summary

A full sweep for existing accounting infrastructure — Chart of Accounts, journal model,
posting engine, fiscal period, ledger models, financial services — found **none**. Every
apparent hit (`stock_ledger`, Tally `*Voucher*.js` interop files, `groupClassifier.js`,
"Customer/Supplier Ledger" report aliases, `audit_log`, `transactionEngine.js`) was
confirmed to be a false positive under inspection. Reusable assets — `js/gst.js`'s money
math, `current_fy()`'s fiscal-year convention, the per-company `fy_start_month` — were
reused, never duplicated. Full detail: `docs/reports/milestone-15A-completion.md` §1.

## Governance Decisions

Two conflicts with existing governing documents were found and resolved explicitly before
implementation, not silently:

1. **`milestone-8.1-ux-architecture.md` §1** ("not accounting software, not a general
   ERP") — resolved by **ADR-0007**: the historical document is never rewritten; the
   statement is recorded as superseded by the accumulated direction of Milestones 12A–15A.
2. **`platform-roadmap.md`** had not been updated for Milestone 14C at all — brought
   current in this same milestone (§3/§4/§6/§7/§8), alongside the new 15A entries.

## ADR References

- **ADR-0007** (ApnaBill Scope Evolution) — records ApnaBill's evolution into a full ERP
  platform; supersedes the "not accounting software" statement without rewriting it.
- **ADR-0008** (Accounting Money — Integer Minor Units) — the balanced-entry correctness
  foundation; rejects the float-tolerance pattern already live in `xmlBusinessRules.js`.
- **ADR-0009** (Journal Line — Two-Sided Amounts) — `debit`/`credit`, not one signed
  amount; fixes the eventual `journal_lines` schema shape.
- **ADR-0010** (Account Catalogs — Open/Closed) — open category/type catalogs, closed
  normal-balance derivation table, with `gst`/`suspense`/`control` deliberately ambiguous.
- **ADR-0011** (Accounting Validation — Throw vs. Result) — contract construction throws;
  business-rule validation returns `{ isValid, errors }`.

## Extension Points

The three shared registries (`accountRegistry`, `voucherTypeRegistry`,
`postingProviderRegistry`) exported from `index.js` **are** this platform's extension
points, the same registry-as-extension-point pattern `reportRegistry` established for the
Reporting Platform. No second extension engine was built; no capability was added to the
frozen Extension Framework.

## Events and Audit

Five event contracts (`JournalEntryPosted`, `JournalEntryReversed`, `FiscalPeriodClosed`,
`FiscalPeriodReopened`, `FiscalPeriodLocked`) and one new aggregate (`accounting`) were
added additively to `events/registry/eventTypes.js`, with matching audit record versions
in `audit/registry/auditRegistry.js`. **Zero events are published anywhere in this
milestone** — publication begins in Milestone 15B, the first milestone in which a journal
entry is actually posted or a fiscal period is actually closed.

## Regression Summary

**1540/1540 passing across all 22 pre-existing suites**, unchanged from the 14C baseline —
including `events/eventBus.test.html` (58/58) and `audit/audit.test.html` (62/62), the two
suites covering the files this milestone modified. **116/116** in the new
`accountingPlatform.test.html`. Full per-suite table:
`docs/reports/milestone-15A-completion.md` §19.

## Known Limitations

- **Zero consumers** — by design. No screen, no persistence, no real posting exists yet.
- **No authorization model** — `createdBy` on a journal entry is carried, validated, and
  unenforced, identical to Reporting's own `requiredCapability` gap (ADR-0003).
- **No `accountingContext.js`** — deliberately omitted; nothing in this platform runs, so
  there is nothing yet to log or trace.
- **Fiscal year label derivation is bug-compatible with a latent Postgres defect**
  (`current_fy()`'s century-rollover behaviour) by deliberate choice — see
  `fiscal/fiscalYear.js`'s own header and `docs/reports/milestone-15A-completion.md` §9.

## Remaining Work for Milestone 15B

Full list: `docs/reports/milestone-15A-completion.md` §18 (deliberately omitted) and §20
(handoff). Headline items: the actual `journal_entries`/`journal_lines`/`accounts`/
`fiscal_periods` schema, a real posting pipeline invoking `buildJournalEntry`, reversal and
recurring-journal semantics, posting approval/authorization, and an `accountingContext.js`
once there is a real operation for it to log.
