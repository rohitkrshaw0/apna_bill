# Milestone 14A Completion Report — Reporting Platform Foundation

**Status:** Complete. Per this milestone's own explicit instruction: **STOP here.** No
commit, merge, tag, or push without explicit approval, and no work begins on Milestone
14B until it is separately authorized.

---

## 1. Reporting Platform Architecture Overview

A new, sixth infrastructure-style platform, `js/services/reporting/`, sibling to
`events/`, `diagnostics/`, `jobs/`, `audit/`, `extensions/`, and `businessIntelligence/`.
It follows the exact `shared/ → contracts/ → registry/ → lifecycle/ → context/ →
<domain layer> → index.js` idiom every one of those five platforms already established —
this is the sixth application of a pattern this repository has used five times before,
not a new one. Full module map, dependency graph, and public API table:
`docs/architecture/reporting-platform-architecture.md`.

The platform computes nothing and holds no business data. Its only external dependency is
`diagnostics/`'s already-exported factories (`createStructuredLogger`,
`createTraceContext`), reused verbatim — the same reuse relationship the Job Engine and
Audit Platform already have with Diagnostics. Its `shell/` layer composes the Product
Experience Platform's existing, unmodified exports (`js/ui/layout.js`, `button.js`,
`searchInput.js`, `loadingState.js`, `emptyState.js`, `debounce.js`) rather than
reimplementing any of them.

```
ERP -> Business Intelligence -> BusinessSnapshot -> Executive Command Center (13C)
ERP -> Infrastructure (Events / Diagnostics / Jobs / Audit / Extensions)
ERP -> Reporting Platform (this platform, 14A) -> real reports (14B+)
```

Proven live in the real application per this milestone's own explicit refinement during
planning: `reports.html`, a new hub screen reached from `menu.html`, exercises the full
Registry → Context → Lifecycle → Shell pipeline against the real, shared `reportRegistry`
on every load — not just inside the test suite.

## 2. New Shared Modules Created

```
js/services/reporting/
  shared/freezeDeep.js, generateId.js, now.js
  contracts/reportContract.js
  registry/reportRegistry.js
  lifecycle/reportLifecycle.js
  context/reportContext.js
  filters/dateRangePresets.js
  shell/reportPageLayout.js, reportToolbar.js, reportFilterBar.js, reportStates.js
  export/csvExport.js, printExport.js
  index.js
  reportingPlatform.test.html
css/report-print.css
reports.html
```

15 new JS modules, 1 new CSS file, 1 new root HTML screen, 1 new test suite. Every file's
own purpose and the existing factory it reuses (rather than duplicates) is documented in
its own header comment and in the architecture doc §2.

## 3. Registry Architecture

`registry/reportRegistry.js`'s `createReportRegistry()` returns `register`/`get`/`list`/
`has`/`unregister`/`clear` over an in-memory `Map`, keyed by `ReportDefinition.id`.
`register()` runs `assertValidReportDefinition()` first and throws on a duplicate id —
modeled on `extensions/registry/extensionRegistry.js`'s dynamic shape (a duplicate-id
check at call time), not the Job Engine's fixed `JOB_IDS` enum, because reports are
expected to be registered incrementally by future milestones rather than defined as a
small, known-upfront set. `list()` returns definitions sorted by title, for a stable hub
presentation. Full rationale: ADR-0003 decision 1.

The application-wide `reportRegistry` singleton (exported from `index.js`) is
**empty in production** — the same "constructed, nothing registered" state
`extensionRuntime`/`diagnosticsObserver`/`auditSubscriber` are already in. `reports.html`
reads this real, shared instance; the only report definition anywhere in this codebase
lives inside `reportingPlatform.test.html`, registered on an isolated registry instance
that is never imported by any production file.

## 4. Report Lifecycle

`lifecycle/reportLifecycle.js`: four states, `IDLE → LOADING → (LOADED | ERROR)`, plus
`toIdle()` to reset. Every transition returns a **new**, deep-frozen `ReportRun` —
`{ reportRunId, reportId, status, startedAt, finishedAt, durationMs, data, error }` —
never mutates one in place, the same immutable-transition idiom
`jobs/lifecycle/jobLifecycle.js`'s `JobRun` already established. `toError()` reuses
`diagnostics/errors/errorClassifier.js`'s `describeError()` verbatim, the same function
`jobs/lifecycle/jobLifecycle.js` already calls for its own `FAILED` transition.

`reports.html` drives this lifecycle for real on every load: `IDLE → LOADING` (rendered
via skeleton placeholders) `→ LOADED` (rendered via the empty-state factory, since
`reportRegistry.list()` is genuinely empty) — a real, observable state transition in
production, not a hypothetical one only exercised in tests.

## 5. Print Framework

`css/report-print.css` — a **new, sibling file to `css/shared.css`**; `shared.css` itself
has zero lines changed. `@media print` rules hide every on-screen-only chrome element
(sidebar, topbar, bottom nav, toasts, the report toolbar, the report filter bar) and force
black-on-white regardless of the active theme, the standard print convention. `@page`
sets a 16mm margin; `break-inside: avoid` is applied to card-shaped content so a single
card doesn't split across a page boundary. `export/printExport.js`'s `triggerPrint()`
calls the browser's native `window.print()` — no PDF library dependency.

**Verified live** via Chrome DevTools Protocol's `Emulation.setEmulatedMedia({media:
'print'})` against `reports.html`: sidebar/toolbar computed `display: none`, body
background/color forced to `rgb(255,255,255)`/`rgb(0,0,0)`, the empty-state heading still
present and legible. Screenshot evidence reviewed during implementation.

## 6. Export Framework

`export/csvExport.js`: `rowsToCsv(rows, columns)` (RFC-4180-style quoting/escaping,
CRLF line endings) and `downloadCsv(rows, columns, filename?)` (client-side `Blob` +
synthetic anchor click, no network round-trip). Deliberately independent of the Data
Exchange Platform's own exporters (`js/services/dataExchange/**`), which serialize to
Tally XML / canonical JSON for system-to-system interop — the wrong shape for "download
the rows on screen as a spreadsheet." Import/Export Platform is frozen and is not
imported anywhere under `js/services/reporting/`.

`shell/reportToolbar.js`'s Export button is **present but disabled, with an explanatory
reason**, on `reports.html` specifically — the hub lists report *definitions*, not report
*rows*, so there is nothing real to export yet. This is the same, unmodified toolbar
component a real 14B report will use with `exportDisabled: false` once it has resolved
rows to export — not a hub-specific shim.

## 7. Routing Architecture

This is a no-bundler, multi-page application; "routing" here means **each report is its
own HTML screen**, discovered through the registry rather than a hardcoded nav list.
`ReportDefinition.href` names where a report's own screen lives; `reports.html`'s
`renderContent` callback (dormant in production today, since the list is empty) maps each
discovered definition to a `createListRow()` with a chevron and an `onClick` navigating to
its `href` — real, correct code for the moment a report exists, simply unreachable until
one does.

**Navigation**: a new row in `menu.html`'s existing "Insights" section, alongside
Dashboard — the same non-invasive mechanism Milestone 13C already used and shipped for
`dashboard.html`. `js/ui/layout.js`'s `PAGE_META`/`NAV_CHIP_ORDER`/`BOTTOM_NAV_ORDER`
catalog (the frozen Product Experience Platform) was **not** modified;
`shell/reportPageLayout.js`'s `initReportShell()` passes a `current: 'reports'` key that
matches no `PAGE_META` entry, which `renderSidebar()`/`renderNavChips()` already handle
gracefully (no active highlight, no error) — verified live, no console error, correct
sidebar/topbar/bottom-nav chrome.

## 8. Extension Architecture

`reportRegistry.register(definition)` **is** this platform's extension point — the same
way every sibling platform's own registry is its extension mechanism. No capability was
added to `js/services/extensions/capabilityNames.js` (frozen Extension Framework); a
future `ReportProvider` capability is deferred, the same disclosed-but-unwired state
Business Intelligence's own `DashboardCardProvider` is already in. Full rationale:
ADR-0003 decision 2.

## 9. Files Modified

**New (18):** 15 files under `js/services/reporting/**` (§2), `css/report-print.css`,
`reports.html`, `docs/architecture/reporting-platform-architecture.md`,
`docs/architecture/ADR/0003-reporting-platform-foundation.md`, this report.

**Modified (3):** `menu.html` (+1 row in the "Insights" section, 1 stale hint-text word
removed since "Reports" is no longer purely aspirational), `docs/architecture/ADR/README.md`
(+1 index row), `docs/architecture/platform-roadmap.md` (§2 dependency diagram +
Completed Milestones row for 14A — see §11 below for exactly what changed).

**Untouched (confirmed via `git status`):** every file under
`js/services/businessIntelligence/**`, `js/services/events/**`,
`js/services/diagnostics/**`, `js/services/jobs/**`, `js/services/audit/**`,
`js/services/extensions/**`, `js/services/dataExchange/**`, `js/ui/**`, `css/shared.css`,
`schema.sql`, and all 9 other business/dashboard screens.

## 10. Regression Summary

Full existing regression suite re-run headlessly (`python -m http.server` +
`chrome --headless=new --dump-dom`, this repository's own documented method): **all 21
pre-existing suites still pass, 1,473/1,473**, unchanged, since no file any existing suite
covers was modified. The new `reportingPlatform.test.html` suite: **67/67 checks
passed**, covering contract validation, registry CRUD + duplicate-id/invalid-definition
rejection, all four lifecycle transitions, context construction (diagnostics reuse and
permission pass-through both verified), all five date-range presets against a fixed
reference date, CSV escaping, and every shell factory's DOM output (toolbar button
states, filter-bar control rendering, all four `reportStates` branches) — plus one
isolated, end-to-end demonstration pipeline (Registry → Context → Lifecycle → Shell)
proving the full 14B-shape flow works, without registering anything in production.
**Combined total: 1,540/1,540.**

`reports.html`/`menu.html` verified via the same unauthenticated-redirect proof method
used since Milestone 13A: both redirect cleanly to `index.html`, zero console errors,
zero 404s in the local server's access log (confirming every new import resolves).
Responsive verification at true 390/768/1440px viewports via direct Chrome DevTools
Protocol control (`Emulation.setDeviceMetricsOverride`) — `document.documentElement.
scrollWidth === window.innerWidth` at all three, zero horizontal overflow; screenshots
reviewed at each width, both the toolbar/filter bar and the empty-state card render
correctly and responsively. Print-mode verified via `Emulation.setEmulatedMedia` (§5).
Accessibility spot-check: toolbar `role="toolbar"`/`aria-label`, Export's `disabled` +
explanatory `title`, the search input's `aria-label`, a real `<h3>` empty-state heading,
every decorative `<svg>` `aria-hidden`, and the shell's inherited sidebar/theme-toggle
`aria-label`s — all confirmed on the live DOM.

**Not run**: full authenticated interactive verification against a live company (this
environment has no reachable seeded Supabase session, the same disclosed limitation every
prior milestone in this platform has recorded) — bounded by the fact that no
business-logic, Business Intelligence, or database file was touched (§9).

## 11. Architectural Decisions

Recorded formally in `docs/architecture/ADR/0003-reporting-platform-foundation.md`:
the Report Registry's dynamic (not fixed-enum) shape, the registry itself as this
platform's extension point (no Extension Framework change), and Report Permissions as a
carried-but-unenforced contract field. See that document for full context, alternatives
considered, and consequences.

`docs/architecture/platform-roadmap.md` §2's dependency diagram gained one new line
(`ERP -> Reporting Platform (14A) -> real reports (14B+)`) alongside the existing BI/
Infrastructure lines; §3's Completed Milestones table gained one row for 14A. Neither §4
(Current Repository Status) nor §8 (Repository Checkpoints) was touched — this milestone
has not been committed, merged, or tagged, per its own stop condition below, the same
discipline 13A–13D all held.

## 12. Remaining Work Required for Milestone 14B

1. **A product decision on which reports ship first** — the brief's own examples (Sales
   Register, Purchase Register, Stock Report, Supplier Report, Customer Report) are a
   starting menu, not a committed scope; 14A intentionally makes no decision here.
2. **A row-level ERP data-access layer for reports Business Intelligence doesn't already
   aggregate.** BI's `getXSummary()` functions return company-wide aggregates and top-N
   rankings (Milestone 13C's own dashboard consumes these directly); a dated Sales
   Register needs a full, filtered, paginated transaction listing — a different shape,
   requiring new query code over the existing (unmodified) schema. Flagged, not built
   here, per this milestone's own "do not build report calculations" boundary.
3. **Real `href` wiring** — `ReportDefinition.href` and `reports.html`'s own
   `renderContent` navigation code are ready and tested, but unreachable until a report
   is actually registered with a real screen behind it.
4. **Real Export wiring** — `shell/reportToolbar.js`'s Export button needs
   `exportDisabled: false` and a real `onExport` calling `downloadCsv()` against a report's
   own resolved rows, once one exists.
5. **A real authorization gate for `requiredCapability`**, if wanted — needs an actual
   roles/permissions model this application does not yet have; explicitly out of scope
   until then (ADR-0003).
6. No Design System amendment is anticipated — 14A introduced zero new `css/shared.css`
   tokens or rules; `css/report-print.css` is a wholly new, additive file.

**Per this milestone's own explicit instruction: STOP here.** No commit, merge, tag, or
push without explicit approval, and no work begins on 14B until it is separately
authorized.
