# Reporting Platform — Architecture Reference

This is the permanent architectural reference for `js/services/reporting/`, written for
whoever maintains or extends this module next. It describes the system **as it stands
today**, organized by concept, not by milestone. It does not repeat the rationale already
recorded in the milestone docs — consult those when you need the "why" behind a specific
decision:

- `docs/reports/milestone-13D-completion.md` — the gap analysis that established no
  Reporting Engine existed anywhere in this repository
- `docs/reports/milestone-14A-completion.md` — what was actually built and verified
- `docs/architecture/ADR/0003-reporting-platform-foundation.md` — the registry-shape,
  permissions, and extension-point decisions this platform is built on
- `docs/architecture/reporting-decision-matrix.md` — **read this before proposing any new
  report.** A practical decision tree (new report vs. preset vs. alias vs. duplicate vs.
  ERP vs. BI vs. "this needs a Business Intelligence platform decision instead") plus a
  quick index of every BI function and whether a report already consumes it — the fast
  path through ADR-0004/0005/0006 without re-deriving them from scratch each milestone

## 1. What this platform is

The Reporting Platform is ApnaBill's foundation for future business reports — a Report
Registry, Definition Contract, Lifecycle, Context, a shared report shell (page layout,
toolbar, filter bar, loading/empty/error states), a Print Framework, and an Export
Framework. It is **not** a report, not a calculation engine, and computes nothing: it is
purely the infrastructure a future report screen (Milestone 14B+) plugs into, the same
relationship the Product Experience Platform (13A/13B) has to the business screens built
on top of it.

It lives entirely under `js/services/reporting/`, is a sibling of `js/services/events/`,
`js/services/diagnostics/`, `js/services/jobs/`, `js/services/audit/`,
`js/services/extensions/`, and `js/services/businessIntelligence/` — never nested inside
any of them. It depends on exactly one platform's public factories, reused verbatim:
`diagnostics/`'s `createStructuredLogger`/`createTraceContext`/`errorClassifier` (the same
reuse relationship `jobs/`/`audit/` already have with `diagnostics/`). It imports nothing
from `events/`, `jobs/`, `audit/`, `extensions/`, `businessIntelligence/`, or
`dataExchange/` — this platform publishes no Domain Event, registers no job, writes no
audit record, and consumes no Business Intelligence data itself (a future report screen
built on top of it may do any of those things; the foundation itself does none).

```
ERP -> Business Intelligence -> BusinessSnapshot -> Executive Command Center (13C)
ERP -> Infrastructure (Events / Diagnostics / Jobs / Audit / Extensions)
ERP -> Reporting Platform (this platform, 14A) -> real reports (14B+)
```

## 2. Module map and dependency direction

```
shared/                    <- no internal deps (self-contained; deliberately not
  freezeDeep.js, generateId.js,  imported from any sibling platform's own shared/)
  now.js
  ↑
contracts/                  <- shared/
  reportContract.js
  ↑
registry/                   <- contracts/
  reportRegistry.js
  ↑
lifecycle/                  <- shared/, diagnostics/errors (describeError on ERROR)
  reportLifecycle.js
  ↑
context/                    <- diagnostics/ (logger/trace, reused verbatim), supabaseClient
  reportContext.js             (getActiveCompanyId, the same resolver every business
                                 screen already calls) -- the only file that imports
                                 outside this platform and diagnostics/
  ↑
filters/                    <- no internal deps (pure date math)
  dateRangePresets.js
  ↑
shell/                      <- js/ui/layout.js, js/ui/button.js, js/ui/searchInput.js,
  reportPageLayout.js           js/ui/loadingState.js, js/ui/emptyState.js, js/ui/debounce.js
  reportToolbar.js              (all EXISTING, UNMODIFIED Product Experience Platform
  reportFilterBar.js            exports -- composed, never duplicated), contracts/,
  reportStates.js               filters/, lifecycle/
  ↑
export/                      <- no internal deps (rowsToCsv/downloadCsv/triggerPrint
  csvExport.js                  are pure/DOM-triggering utilities)
  printExport.js
  ↑
index.js                     <- re-exports everything above; constructs one shared
                                 `reportRegistry` instance, empty in production
```

`context/reportContext.js` is the only file in this platform that imports from outside
`js/services/reporting/` and `diagnostics/` (it also imports `js/supabaseClient.js`'s
`getActiveCompanyId`). `shell/` is the only layer that imports from `js/ui/**` — every
other file here is independently usable and independently testable with zero DOM
involvement, the same "most files need no host platform at all" property
`diagnostics-architecture.md` §2 documents for its own module map.

## 3. Public API (`js/services/reporting/index.js`)

```js
import {
  reportRegistry, createReportRegistry,
  createReportDefinition, assertValidReportDefinition,
  REPORT_CATEGORIES, REPORT_DATA_SOURCES, REPORT_FILTER_KEYS, REPORT_EXPORT_FORMATS,
  REPORT_STATUS, createReportRun, toLoading, toLoaded, toError, toIdle,
  createReportContext,
  DATE_RANGE_PRESETS, resolveDateRangePreset,
  REPORT_SHELL_IDS, renderReportPageHeader, initReportShell, renderReportShellSlots,
  createReportToolbar, createReportFilterBar, renderReportState,
  rowsToCsv, downloadCsv, triggerPrint
} from '<path>/services/reporting/index.js';
```

| Export | Kind | Purpose |
|---|---|---|
| `reportRegistry` | instance | The one shared, application-wide registry. Empty until a future report definition is registered — nothing registers one in this milestone. |
| `createReportRegistry()` | factory | An isolated registry — for tests, or a deliberately separate instance. |
| `createReportDefinition(fields)` / `assertValidReportDefinition(def)` | functions | Contract construction/validation (§4). |
| `REPORT_CATEGORIES` / `REPORT_DATA_SOURCES` / `REPORT_FILTER_KEYS` / `REPORT_EXPORT_FORMATS` | constant maps | Contract field vocabularies (§4). |
| `REPORT_STATUS` / `createReportRun` / `toLoading` / `toLoaded` / `toError` / `toIdle` | constants/functions | Report Lifecycle (§5). |
| `createReportContext(opts)` | function | Builds one report's scoped diagnostics + permission surface (§6). |
| `DATE_RANGE_PRESETS` / `resolveDateRangePreset(preset, referenceDate?)` | constants/function | Shared Date Range Infrastructure (§7). |
| `REPORT_SHELL_IDS` / `renderReportPageHeader` / `initReportShell` / `renderReportShellSlots` | constants/functions | Shared Report Shell (§8). |
| `createReportToolbar(opts)` | function | Report Toolbar — Print/Export (§9). |
| `createReportFilterBar(opts)` | function | Shared Filter Infrastructure (§7). |
| `renderReportState(opts)` | function | Loading/Empty/Error/Content state wiring (§8). |
| `rowsToCsv(rows, columns)` / `downloadCsv(rows, columns, filename?)` | functions | CSV export (§10). |
| `triggerPrint(hooks?)` | function | Print export, via `window.print()` against `css/report-print.css` (§10). |

## 4. The Report Definition Contract

```
id                unique, no ad hoc duplicates (enforced at registry register())
title             human-readable, shown on the hub and a report's own header
description
category          e.g. REPORT_CATEGORIES.SALES -- an open string, not enum-enforced;
                    future report categories are expected to grow beyond what this
                    milestone can name
dataSource        one of REPORT_DATA_SOURCES ('erp' | 'businessIntelligence') -- metadata
                    only; this platform wires no actual data access for either value
filters           string[] of REPORT_FILTER_KEYS this report declares support for
exportFormats     string[] of REPORT_EXPORT_FORMATS this report supports
requiredCapability string|null -- carried, validated, UNENFORCED (§6)
href              string|null -- where this report's own screen lives; null for a
                    definition with no live screen yet
```

Every `ReportDefinition` is deep-frozen by `createReportDefinition()`.

## 5. Report Lifecycle

Four states: `IDLE -> LOADING -> (LOADED | ERROR)`, with `toIdle()` available to reset
back to a fresh `IDLE` run (e.g. when a filter changes and the previous run's data/error
no longer applies) — the same "explicit states, immutable transitions" idiom
`jobs/lifecycle/jobLifecycle.js`'s `JOB_STATUS`/`JobRun` already established. Every
transition returns a **new** frozen `ReportRun`, never mutates one in place.

```
ReportRun  { reportRunId, reportId, status, startedAt, finishedAt, durationMs, data, error }
```

## 6. Report Context and Permissions

`createReportContext({ reportId, definition?, filters?, resolveActiveCompanyId? })`
returns `{ reportId, companyId, filters, logger, trace, permissions }`. `logger`/`trace`
are built from `diagnostics/`'s own already-exported factories
(`createStructuredLogger`, `createTraceContext`) — reused verbatim, zero duplicated
logic, exactly the reuse relationship `jobs/dispatcher/jobDispatcher.js` and
`audit/subscriber/auditSubscriber.js` already have with `diagnostics/`. There is no
`reportTraceContext.js` and no second context system.

**Permissions are carried, validated, and unenforced.** `permissions.requiredCapability`
is read straight through from the report's own `ReportDefinition` — never checked against
anything. There is no roles/permissions model anywhere in this application to gate
against, and Authentication is frozen for this milestone. This is a disclosed, deliberate
gap, not an oversight: it mirrors the Job Engine's `CANCELLED` state ("exists and works,
but nothing calls it") and Business Intelligence's `DashboardCardProvider` capability
("declared but not yet wired") — both already-established "real plumbing, no consumer
yet" precedents in this codebase. See ADR-0003 for the full reasoning. **Do not treat
`requiredCapability` as a security boundary** — it is metadata a future authorization
milestone can build a real gate against.

## 7. Filters

`filters/dateRangePresets.js`'s `resolveDateRangePreset(preset, referenceDate?)` is pure
date math (`DATE_RANGE_PRESETS.TODAY`/`YESTERDAY`/`THIS_WEEK`/`THIS_MONTH`/`LAST_MONTH` ->
a `{from, to}` "YYYY-MM-DD" pair; `CUSTOM` throws — the caller reads its own two date
inputs instead). It queries no data source and filters nothing itself; it only translates
a friendly label into concrete dates, presentation-layer plumbing analogous to
`dashboard.html`'s own `fmtDate()` helper (13C).

`shell/reportFilterBar.js`'s `createReportFilterBar({ filters, selectOptions?, onChange })`
renders only the controls a caller declares via `REPORT_FILTER_KEYS` — `SEARCH` reuses
`js/ui/searchInput.js`'s `createSearchInput()` verbatim; `DATE_RANGE` composes the preset
select above with two native `<input type="date">` elements for `CUSTOM` (the same native-
date-input convention `sale.html`/`purchase.html`'s own topbar chips already use — no Form
Framework date field exists in this app, and none was invented here);
`CATEGORY`/`STATUS`/`SUPPLIER`/`CUSTOMER` are generic native `<select>` elements populated
from caller-supplied options — this platform has no idea what suppliers/customers/
categories any future report needs.

## 8. Shared Report Shell

`shell/reportPageLayout.js` composes `js/ui/layout.js`'s existing, **unmodified**
`renderPageHeader()`/`initShell()` — the Product Experience Platform, frozen for this
milestone. `initReportShell()` calls `initShell({ current: 'reports', ... })` with a
`current` key that matches no `PAGE_META` entry — the same technique `dashboard.html`
(13C) already uses: `renderSidebar()`/`renderNavChips()` degrade gracefully on an
unmatched key (no active highlight, no error), so a report screen gets full shell chrome
without this platform adding a `reports` entry to the frozen
`PAGE_META`/`NAV_CHIP_ORDER`/`BOTTOM_NAV_ORDER` catalog. `renderReportShellSlots()`
returns the three container ids (`REPORT_SHELL_IDS.TOOLBAR`/`FILTER_BAR`/`CONTENT`) every
report screen composes its own toolbar/filter-bar/content into.

`shell/reportStates.js`'s `renderReportState({ container, run, renderContent, ... })` is
lifecycle-driven: `LOADING` renders `js/ui/loadingState.js`'s existing skeleton
primitives; `EMPTY` and `ERROR` both render `js/ui/emptyState.js`'s existing
`createEmptyState()` — the exact precedent `dashboard.html`'s own catch block already set
(Milestone 13C): an error is presented *through* the empty-state factory with an
error-flavored title/message, not a second, new component. `LOADED`-with-data delegates
entirely to the caller's own `renderContent` — this platform has no opinion about what a
report's real content looks like.

## 9. Report Toolbar

`shell/reportToolbar.js`'s `createReportToolbar({ onPrint, onExport, exportDisabled?,
exportDisabledReason? })` builds Print/Export buttons from `js/ui/button.js`'s existing,
unmodified `createButton()`/`setButtonBusy()`. A caller with nothing exportable yet (the
Reports hub page today; any future report before it has resolved its own rows) passes
`exportDisabled: true` with a reason — a disabled, explained control, not an omitted or
faked one. `js/ui/icons.js`'s catalog (frozen) has no printer/download entry; both are
inlined directly in this file as decorative-only SVGs (the button's own text label
already carries the accessible name) rather than extending that frozen catalog for a
two-consumer glyph.

## 10. Print Framework and Export Framework

**Print**: `css/report-print.css` is a **new, sibling file to `css/shared.css`** —
`shared.css` itself is never modified, zero lines touched. Its `@media print` rules hide
on-screen-only chrome (sidebar, topbar, bottom nav, toasts, the report toolbar and filter
bar) and force black-on-white regardless of the active theme (the standard print
convention — a page printed from dark mode should not print a dark background). Every
report screen links this stylesheet alongside `shared.css`. `export/printExport.js`'s
`triggerPrint()` calls the browser's native `window.print()` — no PDF library dependency,
consistent with this application's zero-runtime-dependency, no-bundler architecture.

**Export**: `export/csvExport.js`'s `rowsToCsv(rows, columns)` / `downloadCsv(rows,
columns, filename?)` is a generic, RFC-4180-style CSV serializer + browser-native download
trigger (`Blob` + a synthetic anchor click — no network round-trip). This is deliberately
independent of the Data Exchange Platform's own exporters
(`js/services/dataExchange/**`), which serialize to Tally XML / canonical JSON for
system-to-system interop — the wrong shape for "let a user download the rows on their
screen as a spreadsheet." The Import/Export Platform is frozen for this milestone and is
not imported anywhere under `js/services/reporting/`.

## 11. Extension points

`reportRegistry.register(definition)` **is** this platform's extension point — the same
way every sibling infrastructure platform's own registry is its extension mechanism
(`jobs/registry/jobRegistry.js`, `audit/registry/auditRegistry.js`,
`events/registry/eventTypes.js`). A future milestone adds a real report by calling
`register()` on the shared `reportRegistry` instance; nothing in this platform's own files
needs to change. No `ReportProvider` capability was added to
`js/services/extensions/capabilityNames.js` — that file lives inside the frozen Extension
Framework; wiring that specific integration is deferred, the same disclosed-but-unwired
state Business Intelligence's own `DashboardCardProvider` capability is already in
(`business-intelligence-platform.md` §7).

## 12. Current call sites

**As of Milestone 14C, 23 real reports are registered** against the shared
`reportRegistry`, across 16 screens, discoverable from `reports.html` (the Reports hub,
reached from `menu.html`'s "Insights" section).

**12 Operational Reports (14B)**, across 8 screens: Sales Register, Customer Ledger,
Purchase Register, Supplier Ledger, Stock Register, Current Stock, Low Stock, Negative
Stock, Customer Purchase Profile, Outstanding Summary, Supplier Purchase Profile, and
Supplier Outstanding.

**11 Business Analysis Reports (14C)**, across 8 screens: Product Performance Analysis,
Sales Trend Analysis, Category Sales Performance, Purchase Analysis, Margin Analysis,
Product Movement Analysis (plus its three presets — Fast Moving Items, Slow Moving Items,
Dead Stock Analysis), Inventory Investment Analysis, and Business Performance Summary.
Every one is `category: REPORT_CATEGORIES.BUSINESS_INTELLIGENCE` and
`dataSource: REPORT_DATA_SOURCES.BUSINESS_INTELLIGENCE`, each calling exactly one existing
Business Intelligence public API function directly — zero new calculation, zero new ERP
provider (ADR-0006). Full detail: `docs/reports/milestone-14C-completion.md`.

Every one of `js/services/reporting/`'s own files listed in §2 remains exactly as 14A
built it, except two additive `REPORT_FILTER_KEYS` extensions (`PAYMENT_STATUS`, `ITEM`)
made the sanctioned way (§13's "Add a new filter key") in 14B — **14C added zero platform
changes**, a stronger result than 14B: `STATUS` was reused as the presentation-bucket
control on four 14C reports (sales trend band, cost trend, price stability band, movement
class) with no new filter key needed. Full detail on 14B, including which reports reuse an
existing screen/provider and which are genuinely new:
`docs/releases/reporting-platform-operational-reports-v1.0.md`. The one demonstration
`ReportDefinition` this doc's own 14A-era text described is still registered only inside
`reportingPlatform.test.html`, on an isolated registry instance never imported by any
production screen — unchanged, and still mirroring `extensions/sampleExtension.js`'s own
"exercised only by its own test suite" precedent one layer up.

## 13. How to extend this platform (Milestone 14B and beyond)

**Register a real report**: call `createReportDefinition({...})` with a real
`id`/`title`/`description`/`category`/`dataSource`/`filters`/`exportFormats`/`href`
(pointing at that report's own new `.html` screen), then
`reportRegistry.register(definition)` from wherever that milestone's own bootstrap runs.
Nothing in `registry/`, `contracts/`, `lifecycle/`, or `context/` needs to change.

**Build a real report screen**: compose `shell/reportPageLayout.js`'s
`renderReportPageHeader()`/`initReportShell()`/`renderReportShellSlots()` for the shell,
`shell/reportFilterBar.js` for whichever filters the report's own definition declares,
`shell/reportToolbar.js` with a real `onExport` calling `export/csvExport.js`'s
`downloadCsv()` against the report's own resolved rows, and drive
`lifecycle/reportLifecycle.js`'s states through `shell/reportStates.js` as the report's
own data fetch progresses — the exact pipeline `reports.html` itself already exercises
end-to-end in this milestone, just with real data instead of an empty registry read.

**Source a report's data**: governed by
`docs/architecture/ADR/0004-reporting-data-access-strategy.md` — for a report whose
`dataSource` is `REPORT_DATA_SOURCES.BUSINESS_INTELLIGENCE`, call
`businessSnapshotProvider.getBusinessSnapshot()` (or any of the six public Business
Intelligence API objects) directly, never `metrics/`/`calculators/`/`aggregators/`
directly — the same sanctioned consumption point `business-intelligence-platform.md` §6
already documents for "any future consumer... a scheduled report, a different UI." For a
report whose `dataSource` is `REPORT_DATA_SOURCES.ERP` (a row-level transactional listing
no BI aggregate already exposes, e.g. a dated Sales Register), a new, thin,
read-only query layer over the existing, unmodified database schema is needed — its exact
location deliberately left for the first real ERP-sourced report to decide (ADR-0004), but
its rules (read-only, reuse the existing Supabase/RLS pattern, one named function per
real need, compose an existing ERP query before writing a new one) are already fixed.

**Add a new filter key**: extend `contracts/reportContract.js`'s `REPORT_FILTER_KEYS` and
`shell/reportFilterBar.js`'s `switch` with the new control. Both changes stay inside this
platform's own files.

## 14. Future milestones

- **14B Operational Reports — complete.** 12 reports registered (§12); full record in
  `docs/releases/reporting-platform-operational-reports-v1.0.md` and
  `docs/reports/milestone-14B-completion.md`.
- **14C Business Analysis Reports — complete.** 11 reports registered (§12), 100%
  Business-Intelligence-sourced, zero new ERP providers, zero platform changes; full
  record in `docs/reports/milestone-14C-completion.md` and
  `docs/architecture/ADR/0006-business-analysis-report-pattern.md`. A repository audit
  found 65 of the BI Platform's 69 public API methods had zero consumers before this
  milestone — 14C is a pure consumption layer over that existing surface.
- **A real authorization gate for `requiredCapability`** — not designed here; needs an
  actual roles/permissions model this application does not yet have (§6). Still
  undesigned as of 14C — every report's `requiredCapability` remains `null`.
- **`ReportProvider` as a real Extension Framework capability** — deferred (§11);
  wire it if/when a real extension needs to contribute a report definition. Still
  deferred as of 14C.
- **A row-level ERP query layer for reports BI doesn't already aggregate — built (14B).**
  Four such providers exist (`js/salesRegisterData.js`, `js/purchaseRegisterData.js`,
  `js/stockRegisterData.js`, `js/customerOutstandingData.js`), governed by ADR-0004 and
  ADR-0005 (Operational Report Data Provider Pattern) — one provider per
  operational-report domain, never a shared or generic engine. **Not exercised by 14C** —
  every 14C report is BI-sourced (ADR-0006).
- **New Business Intelligence calculations a 14C audit found genuinely missing** (not
  built here — a separately-approved Business Intelligence platform decision, per
  `business-intelligence-platform.md` §13): an ABC/Pareto classification, and a
  cross-domain category summary joining Inventory/Purchase/Sales/Pricing's own
  `CategorySummary` variants by category key.
- **14D** — not yet scoped or approved as of this writing.
