# Reporting Platform v3

**As of tag:** `reporting-business-analysis-reports-v1.0` · **Commit:** `4c02b9d` (`master`) ·
**Date:** 2026-08-02

This is **not** a new release checkpoint tied to a new tag — no code changed to produce
this document. It is a cross-cutting synthesis, written the moment Milestone 14C merged to
`master`, marking the point where the Reporting Platform stops being "a sequence of
reporting milestones" and becomes a **complete, three-layer reporting system** that future
report work builds on top of. Every fact in this document is already recorded somewhere
else (`reporting-platform-architecture.md`, the three per-milestone release docs, the
report catalog); this document's only job is to say, in one place, "here is exactly what
the Reporting Platform consists of today, and here is what building the next report on it
does and doesn't require."

## Why this document exists

Three checkpoints landed in sequence: `reporting-platform-foundation-v1.0` (14A) →
`reporting-operational-reports-v1.0` (14B) → `reporting-business-analysis-reports-v1.0`
(14C). Each one's own release doc is necessarily scoped to *that* milestone. None of them,
individually, answer the question a future report author actually has: *"what does the
Reporting Platform look like today, end to end, and what exactly is registered on it?"*
This document answers that question once, so nobody has to reconstruct the answer by
reading three release docs, three completion reports, and the architecture reference in
sequence.

## The Reporting Platform, as it stands today

```
ERP -> Business Intelligence -> BusinessSnapshot -> Executive Command Center (13C)
ERP -> Infrastructure (Events / Diagnostics / Jobs / Audit / Extensions)
ERP -> Reporting Platform (14A)
         ├── Operational Reports      (14B, ERP + BI sourced)
         └── Business Analysis Reports (14C, 100% BI sourced)
       -> Reports hub (reports.html)
```

**Reporting Platform Foundation (14A, v1)** — `js/services/reporting/` (shared/contracts/
registry/lifecycle/context/filters/shell/export/index.js), a dynamic `reportRegistry`
modeled on the Extension Framework's own registry, the `ReportDefinition` contract
(id/title/description/category/dataSource/filters/exportFormats/`requiredCapability`/href),
the shared report shell (toolbar, filter bar, date-range presets, loading/empty/error
states, all composing existing `js/ui/**` factories unmodified), CSV export, and native
browser print — independent of the frozen Data Exchange Platform. Zero reports registered
at this checkpoint by design (`reports.html` showed an honest empty state).

**Operational Reports (14B, v2)** — the first 12 real reports: Sales/Purchase/Stock
Register (new, narrow ERP data providers, ADR-0005), Current Stock with Low/Negative Stock
presets, Customer Ledger/Purchase Profile/Outstanding, Supplier Ledger/Purchase Profile/
Outstanding. Five of the twelve needed no new screen or provider — repository validation
found them to be reuses, presets, or exact duplicates of a report that already existed.
Introduced two additive `js/services/reporting/` filter-key extensions
(`PAYMENT_STATUS`, `ITEM`) — the only two changes to the platform itself across all three
milestones.

**Business Analysis Reports (14C, v3)** — 11 reports across 8 screens, 100%
Business-Intelligence-sourced, zero new ERP providers, zero changes to
`js/services/reporting/`. First consumers of `purchaseIntelligence` and
`pricingIntelligence` anywhere in this application. Introduced ADR-0006 (the
`BUSINESS_INTELLIGENCE` category and "no data provider for a BI-sourced report" rule).

## What's actually registered, right now

**23 `ReportDefinition`s across 16 screens**, zero duplicate `id`s (grep-confirmed each
checkpoint):

| Layer | Reports | Data source |
|---|---|---|
| Operational (14B) | 12 | ERP (4 new providers, ADR-0005) + reuse of existing screens/queries |
| Business Analysis (14C) | 11 | Business Intelligence, one existing public API call per report, zero new calculation |

Full per-report filter/sort/API/CSV detail lives in `docs/reports/report-catalog.md` — the
single canonical, continuously-updated source; this document does not duplicate it.

## Complete checkpoint history

| Tag | Milestone | Represents |
|---|---|---|
| `reporting-platform-foundation-v1.0` | 14A | The platform itself: registry, contract, lifecycle, shell, export — zero reports |
| `reporting-operational-reports-v1.0` | 14B | First 12 reports, ERP- and BI-sourced, two additive filter-key extensions |
| `reporting-business-analysis-reports-v1.0` | 14C | 11 more reports, 100% BI-sourced, zero platform changes, ADR-0006 |

Full verification detail (regression figures, exact files changed, known limitations) for
each lives in its own record under `docs/releases/`. This document does not repeat any of
it.

## What "v3" means

Per each milestone's own completion report (unchanged by this document): **14D is not yet
scoped or approved.** "v3" is not a planned milestone — it is the label for the current,
stable state of the Reporting Platform, and by construction, the next report built on it is
expected to be one of:

- **A new BI-sourced report** consuming one of the still-unconsumed public API methods
  identified in `docs/architecture/reporting-decision-matrix.md` (the practical decision
  tree written at 14C's close specifically for this) — no data provider, no platform
  change, following ADR-0006.
- **A new ERP-sourced report** needing row-level data no BI aggregate exposes — a new,
  narrow, read-only data provider following ADR-0005's established pattern, not a platform
  change.
- **A genuinely new Business Intelligence calculation** (e.g. ABC Analysis, cross-domain
  Category Performance) — out of scope for Reporting entirely; a separately-approved
  Business Intelligence platform decision (`business-intelligence-platform.md` §13), raised
  and rejected as such at 14C's own audit stage.
- **A real authorization gate for `requiredCapability`** — carried, validated, and
  unenforced since 14A; needs an actual roles/permissions model this application does not
  yet have.
- **Executive Reporting** — explicitly reserved terminology and scope for a future
  milestone (14F, per instruction), distinct from Business Performance Summary (14C).

## What is stable vs. what is disclosed, open technical debt

**Stable, frozen, confirmed unmodified across all three reporting milestones:** database
schema, `js/services/businessIntelligence/**` (read extensively, modified nowhere),
`dashboard.html`, `menu.html`, every existing ERP screen and service, `css/shared.css`.
`js/services/reporting/**` itself changed exactly twice (two additive filter keys, 14B) and
not at all in 14C.

**Disclosed, open items** (consolidated from all three checkpoints' own "Known
Limitations"/"Remaining Work" sections — none are blockers, all were flagged at the
milestone that found them):

- No real authorization gate for `requiredCapability` — carried, validated, unenforced
  since 14A (ADR-0003).
- `ReportProvider` as a real Extension Framework capability — still deferred (14A).
- No authenticated interactive verification anywhere across all three milestones — every
  screen verified via the unauthenticated-redirect method plus headless DOM/console/network
  inspection, never against real, seeded company data (disclosed since 13A).
- ABC/Pareto Analysis and cross-domain Category Performance — both require a new Business
  Intelligence calculation or composition; a future, separately-approved BI platform
  decision, not an automatic consequence of any reporting milestone (14C).
- Column visibility and true sortable-column-headers — carried forward since 14B; still no
  consumer has needed either.
- Item/supplier drill-down reports, the total absence of any charting library in this
  repository, and the fully-unconsumed `generateXInsightReport()` family — surfaced but not
  resolved by 14C, recorded in `reporting-decision-matrix.md`.
- Category reports rest on the `hsn_sac` category proxy — a pre-existing, disclosed
  Business Intelligence limitation, not solved by any reporting milestone.

## Where to start

For anyone scoping the next report: read `docs/architecture/reporting-decision-matrix.md`
first (the practical new-report-vs-preset-vs-duplicate-vs-ERP-vs-BI decision tree), then
`docs/reports/report-catalog.md` for what's already registered, then the latest milestone's
own completion report (`docs/reports/milestone-14C-completion.md`) for full audit detail,
then `docs/architecture/reporting-platform-architecture.md` for the platform's own
implementation reference.

## Recommendation

The Reporting Platform is complete through three layers: the platform itself (14A), 12
operational reports (14B), and 11 business analysis reports (14C) — 23 registrations across
16 screens, zero duplicate ids, 1540/1540 regression passing unchanged at every checkpoint.
**Nothing further is required before scoping the next report.** This document does not
authorize, plan, or speculate about what 14D contains beyond what is already listed above
as illustrative examples — that remains a separately-authorized decision.
