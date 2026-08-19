# ApnaBill — Platform Roadmap

This is the permanent, high-level entry point for understanding ApnaBill. It is not a
milestone report, not an implementation guide, and not a design document — it is a
navigation document. Read this first; it points to everything else.

## 1. Project Overview

ApnaBill has moved past being a collection of isolated milestones. It is now composed of
a small number of **permanent platforms**, each with its own living architecture
reference, each built to be extended by future work rather than replaced by it:

- A **Core ERP Platform** — the production business application (Company, Customers,
  Suppliers, Items, Purchases, Sales, Manufacturing, Stock, Dashboard, Reports).
- A **Data Exchange Platform** — moving business data into and out of the app (XML,
  JSON, native backup/restore, a shared Migration Engine underneath all of them).
- An **Infrastructure Platform** — cross-cutting capabilities every future feature can
  build on without touching the ERP itself (a Domain Event Bus, Diagnostics &
  Observability, a Background Job Engine, an Audit Platform, and a Plugin & Extension
  Framework).

Each platform is additive: newer platforms depend on older ones (Infrastructure depends
on nothing in the ERP; the ERP depends on nothing in Infrastructure), never the reverse,
and a platform's own internals are not modified by whatever gets built on top of it.

## 2. Current Architecture

```
Core ERP Platform
  ↓
Data Exchange Platform
  ↓
Infrastructure Platform
```

**Core ERP Platform** — Company/Firm management, Customers, Suppliers, Items, Purchases,
Sales, Manufacturing, Stock, Dashboard, Reports. The production business application;
database schema frozen, business logic stable.

**Data Exchange Platform** — Tally-dialect XML import/export, native `.apnabill`
backup/restore, canonical JSON import/export, all running on one shared Migration Engine
(planning, validation, dependency ordering, conflict resolution, progress reporting,
execution, rollback, error normalization, implemented once rather than once per format).

**Infrastructure Platform** — capabilities every future feature can consume without
modifying the ERP or Data Exchange:
- a synchronous, in-process **Domain Event Bus**,
- real **Event Integration** publishing business facts from the ERP and Data Exchange,
- a passive **Diagnostics & Observability** layer (structured logging, trace context,
  error classification, execution timing, performance metrics),
- a **Background Job Engine** consuming those events to run non-blocking infrastructure
  work,
- an **Audit Platform** subscribing directly to Domain Events (a peer of Diagnostics and
  the Job Engine, not routed through either) to record immutable business history,
- a **Plugin & Extension Framework** letting future capabilities extend ApnaBill through
  a controlled context (Event Bus, Diagnostics, Audit query, Job Dispatcher observation)
  without modifying the core.

No implementation detail is repeated here — see §7 for where each platform's own
authoritative reference lives.

## 3. Completed Milestones

| Milestone(s) | Delivered |
|---|---|
| 1–8 | Core ERP Platform |
| 9 | Universal Data Exchange Platform (XML import/export, native backup/restore, Migration Engine) |
| 10 | Universal JSON Data Exchange Platform |
| 11A | Domain Event Bus |
| 11B | Domain Event Integration |
| 11C | Diagnostics & Observability Platform |
| 11D | Background Job Engine |
| 11E | Audit Platform |
| 11F | Plugin & Extension Framework |
| 12A | Inventory Intelligence Platform (read-only Business Intelligence layer over Inventory/Items/Purchases/Sales) |
| 12B | Purchase Intelligence Platform (extends the same Business Intelligence layer with purchase price/trend/supplier analysis) |
| 12C | Sales Intelligence Platform (extends the same Business Intelligence layer with sales price/trend/customer/margin analysis) |
| 12D | Pricing Intelligence Platform (extends the same Business Intelligence layer with margin/markup/discount/price-stability analysis) |
| 13A | Product Experience Foundation (shared dialog lifecycle, button, and loading-state UX infrastructure layer in `js/ui/`, governed by a Design System §22 amendment; `stock.html` migrated as the reference screen; the `chooseBatch()`/`chooseBatchTemplate()` Esc-hang defect fixed at its root) |
| 13B | Product Experience Migration (all seven remaining business screens — `menu.html`, `items.html`, `suppliers.html`, `index.html`, `manufacturing.html`, `sale.html`, `purchase.html` — migrated onto the 13A shared layer; two new shared factories built, `js/ui/segmentedToggle.js` and `js/ui/searchResults.js`, closing gaps 8.3/8.5/13A had each deferred to their first real consumer) |
| 13C | Executive Command Center (`dashboard.html`, the Business Dashboard Platform's first UI consumer — reads exclusively from `businessDashboard.getBusinessSnapshot()`, zero new Business Intelligence computation, zero change to `js/ui/**` or `css/shared.css`; reached from a new row on `menu.html`) |
| 14A | Reporting Platform Foundation (`js/services/reporting/` — Report Registry, Definition Contract, Lifecycle, Context, shared Report Shell, Print Framework, Export Framework; zero actual reports, zero new calculation; proven live via `reports.html`, a real hub screen showing an honest empty registry, reached from a new row on `menu.html`) |
| 14B | Reporting Platform Operational Reports (`reports.html` now lists 12 real, registered reports across 8 screens — Sales/Purchase/Stock Register, Current Stock with Low/Negative Stock presets, Customer Ledger/Purchase Profile/Outstanding, Supplier Ledger/Purchase Profile/Outstanding — built on the unmodified 14A foundation plus two additive filter-key extensions; 4 new ERP data providers, zero new Business Intelligence calculation, zero duplicated screens where an existing report or BI aggregate already covered the need) |
| 14C | Reporting Platform Business Analysis Reports (11 more `ReportDefinition`s across 8 screens — Product Performance, Sales Trend, Category Sales Performance, Purchase Analysis, Margin Analysis, Product Movement Analysis with 3 presets, Inventory Investment, Business Performance Summary — bringing the Reports hub to 23 registrations across 16 screens; 100% Business-Intelligence-sourced, zero new ERP providers, zero changes to `js/services/reporting/` or `js/services/businessIntelligence/`; ADR-0006) |
| 15A | Accounting Platform Foundation (`js/services/accounting/` — Chart of Accounts, Journal/Voucher/Posting Provider Contracts, Balanced Entry Validation, Fiscal Period Platform; zero consumers, zero persistence, zero UI; proven live only by its own 116-check test suite; ADR-0007–0011) |
| 15B | Journal Engine (`js/services/accounting/posting/`, `providers/`, `resolution/` — the `AccountingPlatform.post()`/`.reverse()` façade, the Account Resolution Service, automatic posting providers for Sales/Purchase/Manufacturing, and the persisted schema + RPCs backing them: `accounts`, `fiscal_periods`, `journal_entries`, `journal_lines`, `accounting_settings`, `journal_number_counters`, `post_journal_entry()`, `reverse_journal_entry()`. The first real consumer of 15A's foundation; Sales/Purchase/Manufacturing each call the façade as a second, best-effort step after their own RPC succeeds, surfacing a posting failure without ever blocking the underlying sale/purchase/run. Verified live against a real Supabase staging project (25/25 checks); 45 new client-side checks plus 1540/1540 + 116/116 existing suites unchanged. Tag `journal-engine-v1.0`) |
| 15C | Manual Journal Engine (`journal.html` + `js/manualJournal.js`, the platform's first UI; one new posting provider, `manualJournalPostingProvider.js`, a pure pass-through with no role resolution since the user picks real `accountId`s directly; zero schema/RPC change — the persisted schema already anticipated manual journals. `menu.html` gains a permanent "Accounting" section. Live-validated against a real Supabase staging project after fixing an unrelated infrastructure gap found during that review — see the Purchase Posting hotfix below) |
| — | **Hotfix: Purchase Posting blank Bill Number** (found during 15C's own production readiness review, not itself a milestone). `purchasePostingProvider.js` + `postingFacade.js`: a blank Purchase Bill Number produced an empty-string `reference` `createJournalEntry()` correctly rejected, but the resulting exception escaped `postingFacade.js`'s `post()` uncaught and surfaced as a false "Save failed" even though the purchase had committed. Fixed by wrapping that construction call the same way `buildJournalEntry()` already was, returning `VALIDATION_FAILED` like every other malformed-entry case — protecting every posting provider, not just Purchase. 6 new checks) |
| 15D | Journal Inquiry Platform (`journal-register.html` + `journal-detail.html`, the platform's first **read-only** consumer; one new data-access module, `js/journalRegisterData.js`, flat under `js/`, never registered as a Reporting Platform report since this milestone explicitly does not create financial reports; zero change to `posting/`, `providers/`, `resolution/`, `contracts/`, `registry/`, `validation/`, `fiscal/`, `schema.sql`, `accounting_rpc.sql`, or RLS. Live-validated against a real Supabase staging project; no new `postingPipeline.test.html` checks since nothing in the posting pipeline changed. Tag `journal-inquiry-platform-v1.0`) |
| 15E | General Ledger Platform (`ledger.html` + `js/ledgerData.js`, one account's full transaction history with a running balance; one new, additive, read-only, non-materialized view, `v_journal_ledger_lines` — no new table, no cached/persisted balance, zero client-side balance computation, ADR-0012. Same read-only posture as 15D: zero change to `posting/`, `providers/`, `resolution/`, `contracts/`, `registry/`, `validation/`, `fiscal/`, `accounting_rpc.sql`, or RLS. Tag `general-ledger-platform-v1.0`) |
| 15F | Trial Balance Platform (`trial-balance.html` + `js/trialBalanceData.js`, every account's balance as of a selectable date, bucketed into Debit/Credit with a tie-out check; zero new schema object of any kind — a dedicated architecture review (ADR-0013) proved every single-query approach incorrect for a historical date and confirmed a bounded, parallel fan-out over 15E's existing `balanceAt()` is the only correct option without introducing an RPC. Standalone Accounting screen, not a Reporting Platform report; CSV export reuses the Reporting Platform's standalone `export/csvExport.js` directly. First accounting milestone with a dedicated offline test file, `js/trialBalanceData.test.html` (21 checks), for its own new pure bucketing/totals logic) |
| 15G | Profit & Loss Platform (`profit-loss.html` + `js/profitLossData.js`, Revenue/Direct Expenses/Operating Expenses for a selectable period with Gross Profit, Operating Profit and Net Profit; zero new schema object, composing on 15E's `balanceAt()` called twice per included account since a P&L is a period figure, not an as-of-date balance. Account inclusion is ADR-0014's closed four-category list. Includes one Accounting Foundation correction — account 9000 `Rounding Off` reseeded from `suspense` to the existing `indirectExpenses`, so realised rounding gains/losses reach Net Profit; no new category, no P&L special case, no posting change. Dedicated offline test file, `js/profitLossData.test.html` (31 checks). Tag `profit-loss-platform-v1.0`) |

## 4. Current Repository Status

| | |
|---|---|
| **Current Branch** | `milestone-15h-balance-sheet` (15H is implemented and validated on this branch but **not merged and not tagged** — see §6; it is deliberately absent from §3 and §8 until it is. 15G before it merged via PR #16, merge commit `c420b75`, and its own feature branch has been deleted) |
| **Latest Release** | `profit-loss-platform-v1.0` (15G's own tag, pointing at merge commit `c420b75`; 15C and the Purchase Posting hotfix remain merged but not separately tagged, per the same "each milestone's PR documents its own completion, the next milestone's docs update adds the confirmed checkpoint row" convention this table's §8 follows) |
| **Business Intelligence Platform** | Inventory Intelligence ✓ · Purchase Intelligence ✓ · Sales Intelligence ✓ · Pricing Intelligence ✓ · Supplier Intelligence ✓ · Business Dashboard ✓ |
| **Reporting Platform** | Foundation ✓ (14A) · Operational Reports ✓ (14B — 12 registered reports) · Business Analysis Reports ✓ (14C — 11 more; 23 registrations across 16 screens total; see `docs/releases/reporting-business-analysis-reports-v1.0.md`) |
| **Accounting Platform** | Foundation ✓ (15A) · Journal Engine ✓ (15B) · Manual Journal Engine ✓ (15C — `journal.html`, the platform's first UI) · Purchase Posting hotfix ✓ (found + fixed during 15C's review) · Journal Inquiry Platform ✓ (15D — `journal-register.html`/`journal-detail.html`, the platform's first read-only consumer) · General Ledger Platform ✓ (15E — `ledger.html`, `v_journal_ledger_lines`) · Trial Balance Platform ✓ (15F — `trial-balance.html`, bounded fan-out over `balanceAt()`, ADR-0013) · Profit & Loss Platform ✓ (15G — `profit-loss.html`, period movement over `balanceAt()`, ADR-0014) |
| **Regression** | 1767 / 1767 passing across 26 test files, 0 failures — 1540 existing + 116 (15A) + 59 (15B posting pipeline, includes 15C's 8 manual-journal checks and the hotfix's 6) + 21 (15F `trialBalanceData.test.html`) + 31 (15G `profitLossData.test.html`); 15D and 15E added no posting-pipeline checks (both read-only, verified live instead) |
| **Repository** | Clean, production-ready |

## 5. Platform Dependency Diagram

Conceptual only — see each platform's own architecture reference for the real module
maps and import graphs.

```
Core ERP
  ↓
Data Exchange Platform
  ↓
Infrastructure Platform
    ├── Event Bus
    ├── Diagnostics
    ├── Background Jobs
    ├── Audit
    └── Extension Framework
```

## 6. Upcoming Roadmap

**Milestone 15H (Balance Sheet Platform) is an implemented, validated feature branch, not
a merged or tagged milestone** — this paragraph describes it only; it is deliberately not
reflected in §3's Completed Milestones table or §8's Repository Checkpoints, neither of
which changes until 15H is reviewed, approved, merged, and tagged (the same posture §4
recorded for 15G on its own branch, and §6 recorded for 12D on its). On branch
`milestone-15h-balance-sheet`, Balance Sheet adds `balance-sheet.html` +
`js/balanceSheetData.js`: every account's balance as of a selectable date, classified into
Assets/Liabilities/Equity with a reconciliation check, from one `accounts` read plus a
bounded parallel `balanceAt()` fan-out — **zero new schema object of any kind**, and,
unlike 15F and 15G, zero change to any earlier consumer either, since `ledgerData.js`,
`trialBalanceData.js`, and `profitLossData.js` already exposed everything it needed.

ADR-0015 governs it and records the audit that shaped it. Classification is category-first
over a partition that, together with ADR-0014's four P&L categories, covers all 17 of
`ACCOUNT_CATEGORIES` exhaustively; declared `normal_balance` disambiguates only
`gst`/`suspense`/`control`, being exactly the three categories ADR-0010's derivation table
deliberately omits; an unrecognized category lands in a **visible `Unclassified` section**
rather than being silently excluded as P&L may safely do, because a silent exclusion would
break `Assets = Liabilities + Equity` by exactly that account's balance; and section
subtotals use a section-sense conversion so contra accounts subtract, leaving
`bucketSignedBalance()` unmodified for its existing per-row Dr/Cr display.

The milestone's central finding: an audit of the real chart of accounts established that
`bootstrap_accounting_defaults()` is the only code path in this repository that creates an
account, that its 16-account seed contains **no `equity` account at all**, and that **no
closing-entry mechanism exists anywhere**. Equity is therefore derived — life-to-date
Profit & Loss through the as-of date, computed by reusing 15G's own exported
`buildProfitAndLossRows()` rather than by a second P&L calculation, and split at the
fiscal-year start into "Accumulated Profit / (Loss) Brought Forward" and "Profit / (Loss)
for the Period". Those figures are deliberately **not** labelled Retained Earnings, which
would assert a year-end close this application has never performed. Capital, Drawings,
Opening Balances, and an equity-account workflow are recorded as a carried-forward
Accounting Foundation gap for a future dedicated milestone, explicitly not papered over
here by seeding an account nothing would ever post to.

The approved infrastructure roadmap (11A–11F) is complete. No further infrastructure
milestone is currently approved — nothing beyond 11F is speculated on here. Future work
building on this platform (real extensions, real jobs, real audit consumers) is a matter
for whoever needs it next, not a new infrastructure phase.

**v2 feature work: Milestones 12A, 12B, and 12C are complete.** The Business Intelligence
Platform (`js/services/businessIntelligence/`) is the first "v2" feature
`docs/releases/platform-v2-foundation.md` anticipated — a read-only layer consuming
`events/`, `diagnostics/`, `jobs/`, `audit/`, and `extensions/` through their public
barrels without modifying any of their internals. Milestone 12A built its first domain
(Inventory Intelligence, tagged `inventory-intelligence-v1.0`); Milestone 12B extended the
*same* platform with a second domain (Purchase Intelligence, tagged
`purchase-intelligence-v1.0`, §8) — new sibling files within the same folders, reusing the
same shared cache/diagnostics singletons and two of 12A's own calculators unmodified.
Milestone 12C extended it again with a third domain (Sales Intelligence) — reusing even
more of 12A/12B's own calculators and aggregators verbatim (see
`docs/architecture/business-intelligence.md` §21.7 "Deep reuse" for the one deliberate
exception). None of the three milestones change §5's dependency diagram above — see
`docs/architecture/business-intelligence.md` (§7 below, §§1–19 for Inventory Intelligence,
§20 for Purchase Intelligence, §21 for Sales Intelligence) and
`docs/reports/milestone-12a-completion.md` / `docs/reports/milestone-12b-completion.md` /
`docs/reports/milestone-12c-completion.md` for the full record. 12C has not yet been
committed, merged, or tagged — per its own brief's explicit instruction, it sits on its
own feature branch (`milestone-12c-sales-intelligence`) awaiting approval, the same way
12A and 12B were both documented here before their own commit/merge/tag steps happened.

**Milestone 12D (Pricing Intelligence) is an in-progress feature branch, not a completed
or approved milestone** — this paragraph describes its architecture and objectives only;
it is deliberately not reflected in §3's Completed Milestones table, §4's Current
Repository Status, or §8's Repository Checkpoints, none of which change until 12D is
reviewed, approved, committed, merged, and tagged. On its own branch
(`milestone-12d-pricing-intelligence`), Pricing Intelligence extends the same Business
Intelligence platform with a fourth domain: it joins Purchase Intelligence's (12B) and
Sales Intelligence's (12C) own already-computed per-item price series — reusing both
domains' loaders and metrics wholesale rather than re-scanning either — into margin %,
markup %, price difference, price stability/volatility, and discount analysis, plus
advisory pricing recommendations. Per its own brief's added architectural rule, every
percentage this domain computes (margin %, markup %, discount %) routes through one new,
single shared calculator (`calculators/percentageCalculator.js`) rather than each
aggregator deriving its own formula. See `docs/architecture/business-intelligence.md` §22
for the full architecture reference and `docs/milestones/milestone-12D-pricing-intelligence.md`
/ `docs/reports/milestone-12D-completion.md` for the milestone brief and completion
report.

**Milestone 13D ("Business Reports Experience Platform") is BLOCKED, not in progress and not
completed.** Its brief assumed an existing Reporting Engine (report screens, report services, a
print stylesheet, export UX) to modernize; a full repository search found none — no report screen,
no `js/reports.js`-equivalent module, no report-related schema, no `@media print` rule anywhere, and
no reporting architecture document. `gst.js` (tax-line math), `stock.html`'s per-item ledger dialog,
the Data Exchange Platform, and the Business Intelligence/Executive Command Center platforms were
each considered and ruled out as not being "Reports" — see
`docs/reports/milestone-13D-completion.md` for the full gap analysis and evidence. This paragraph is
the only roadmap change this blocked milestone makes: it is deliberately not reflected in §3's
Completed Milestones table, §4's Current Repository Status, or §8's Repository Checkpoints, since
nothing was built or released. A future "Reporting Platform Foundation" milestone (scope sketched in
the gap analysis' §4) would need to actually build report screens, a report data-access layer, and a
print/export mechanism before a Reports *experience* milestone has anything to act on.

**Milestone 14A (Reporting Platform Foundation) resolves that block.** A new, sixth
infrastructure-style platform, `js/services/reporting/`, sibling to `events/`,
`diagnostics/`, `jobs/`, `audit/`, `extensions/`, and `businessIntelligence/` — a Report
Registry, Definition Contract, Lifecycle, Context, shared Report Shell (page layout,
toolbar, filter bar, loading/empty/error states), a new `css/report-print.css` Print
Framework, and a CSV/print Export Framework. It computes nothing and holds no report
data; its only role is to be the infrastructure a future report (Milestone 14B) plugs
into, the same relationship the Product Experience Platform has to the business screens
built on it:

```
ERP -> Business Intelligence -> BusinessSnapshot -> Executive Command Center (13C)
ERP -> Infrastructure (Events / Diagnostics / Jobs / Audit / Extensions)
ERP -> Reporting Platform (14A) -> real reports (14B+)
```

Proven live, not just in its own test suite: `reports.html`, reached from `menu.html`'s
"Insights" section, runs the full Registry → Context → Lifecycle → Shell pipeline against
the real, shared `reportRegistry` on every load and shows the true state of production —
"Reporting Platform Installed. No reports are currently registered." No report, no fake
data, and no change to any frozen system anywhere in this milestone — full detail:
`docs/architecture/reporting-platform-architecture.md`,
`docs/architecture/ADR/0003-reporting-platform-foundation.md`, and
`docs/reports/milestone-14A-completion.md`.

**Milestone 14B (Reporting Platform Operational Reports) is complete.** Six sub-
milestones (14B.1–14B.6), each preceded by its own repository architecture/schema
validation before any code was written, produced **12 registered reports across 8
screens**: Sales Register, Customer Ledger (reuse), Purchase Register, Supplier Ledger
(reuse), Stock Register (also standing in for the brief's separately-named "Stock
Movement Register" — a repository audit found them identical), Current Stock with Low
Stock/Negative Stock as query-param presets of the same screen, Customer Purchase
Profile, Outstanding Summary, Supplier Purchase Profile, and Supplier Outstanding.

```
ERP -> Reporting Platform (14A) -> real reports (14B) -> Reports hub (12 registered)
```

Two additive, pre-sanctioned filter-key extensions to the 14A foundation
(`PAYMENT_STATUS`, `ITEM`) — no other change to `js/services/reporting/`. Four new,
narrow, read-only ERP data providers (`salesRegisterData.js`, `purchaseRegisterData.js`,
`stockRegisterData.js`, `customerOutstandingData.js`), each governed by ADR-0004
(data-access strategy) and the new ADR-0005 (one provider per operational-report domain,
reuse over duplication). Three reports are `BUSINESS_INTELLIGENCE`-sourced
(`REPORT_DATA_SOURCES.BUSINESS_INTELLIGENCE`), consuming existing public Business
Intelligence APIs directly (`inventoryIntelligence.getItemMetricsSnapshot()`,
`salesIntelligence.getSalesMetricsSnapshot()`, `supplierIntelligence.getSupplierMetricsSnapshot()`)
with zero new calculation; every other report is ERP-sourced. Full detail — architecture,
every reuse-vs-new decision and its reasoning, regression, performance, known
limitations, lessons learned: `docs/releases/reporting-platform-operational-reports-v1.0.md`
and `docs/reports/milestone-14B-completion.md`.

**Milestone 14C (Reporting Platform Business Analysis Reports) is complete.** A
repository audit found 65 of the Business Intelligence Platform's 69 public API methods
had zero call sites outside `js/services/businessIntelligence/**` before this milestone —
including two entire domain API objects, `purchaseIntelligence` and `pricingIntelligence`,
never imported by any screen. 14C is a pure consumption layer over that already-computed
intelligence: **11 more `ReportDefinition`s across 8 screens** (Product Performance, Sales
Trend, Category Sales Performance, Purchase Analysis, Margin Analysis, Product Movement
Analysis with Fast Moving/Slow Moving/Dead Stock presets, Inventory Investment, Business
Performance Summary), bringing the Reports hub to **23 registrations across 16 screens**.
Every report makes exactly one existing Business Intelligence public API call and performs
zero new calculation — zero changes to `js/services/reporting/` anywhere in this milestone,
a stronger result than 14B. New ADR-0006 records the `BUSINESS_INTELLIGENCE` report
category and the "no data provider for a BI-sourced report" rule. Full detail:
`docs/releases/reporting-business-analysis-reports-v1.0.md` and
`docs/reports/milestone-14C-completion.md`.

```
ERP -> Reporting Platform (14A) -> Operational Reports (14B) -> Business Analysis Reports (14C) -> Reports hub (23 registered)
```

**Milestone 15A (Accounting Platform Foundation) is complete.** A new, ninth
infrastructure-style platform, `js/services/accounting/`, sibling to `events/`,
`diagnostics/`, `jobs/`, `audit/`, `extensions/`, `businessIntelligence/`, `dataExchange/`,
and `reporting/` — a Chart of Accounts (Account Registry, category/type catalogs, a
closed normal-balance derivation table), Journal and Voucher Type contracts, a Posting
Provider registry, Balanced Entry Validation built on an integer-minor-units money
representation, and a Fiscal Period Platform. Exactly the "foundation only, consumers
later" shape Milestone 14A used for Reporting: **zero consumers, zero persistence, zero
UI, zero schema change.** Five new ADRs (0007–0011) record the scope-evolution decision
(ApnaBill as a full ERP, superseding `milestone-8.1-ux-architecture.md` §1's "not
accounting software" statement without rewriting that historical document), the
integer-paise money representation, the two-sided journal line shape, the open-catalog/
closed-derivation normal-balance rule, and the throw-vs-result validation split. Five new
event contracts (`JournalEntryPosted`, `JournalEntryReversed`, `FiscalPeriodClosed`,
`FiscalPeriodReopened`, `FiscalPeriodLocked`) were added additively to
`events/registry/eventTypes.js`, with matching `audit/registry/auditRegistry.js` entries —
declared now, published by nothing until Milestone 15B. Proven live only by its own
116-check `accountingPlatform.test.html` suite, importing exclusively through the
platform's public `index.js` surface. Full detail:
`docs/architecture/accounting-platform-architecture.md`,
`docs/releases/accounting-platform-foundation-v1.0.md`, and
`docs/reports/milestone-15A-completion.md`.

```
ERP -> Business Intelligence -> BusinessSnapshot -> Executive Command Center (13C)
ERP -> Infrastructure (Events / Diagnostics / Jobs / Audit / Extensions)
ERP -> Reporting Platform (14A -> 14B -> 14C) -> Reports hub
ERP -> Accounting Platform (15A, foundation only) -> real posting (15B+)
```

**Milestone 15B (Journal Engine) is complete.** This paragraph previously recorded only a
scope decision; it is corrected here to record what was actually built, because the
correction rides in the Milestone 15C branch rather than a separate follow-up commit. A
repository audit performed before scoping (`docs/reports/milestone-15A-completion.md` §20
and a further transaction-flow audit against `sale_rpc.sql`, `manufacturing_rpc.sql`,
`stock_rpc.sql`, and their JS callers) found that Sales and Purchase RPCs return no money
at all — the caller already holds the full computed totals — while Manufacturing's RPC
return alone is a complete, self-balancing entry; and that stock adjustments carry no cost
data whatsoever (`unit_cost` is hardcoded `NULL` in `record_stock_adjustment`).

Per that audit, 15B shipped one cohesive architectural slice, mirroring the Reporting
Platform's own 14A→14B→14C decomposition:

- The **Accounting Platform public posting API** — `AccountingPlatform.post()`/`.reverse()`
  (`js/services/accounting/posting/postingFacade.js`). Sales, Purchase, and Manufacturing
  call this one API and never touch `postingProviderRegistry`, a posting provider, or the
  Account Resolution Service directly. The façade resolves the correct provider, loads that
  company's chart of accounts through a fresh `accountResolutionService`, validates the
  built entry, persists it, and returns success/failure. Domain events (`SALE_CREATED`,
  etc.) remain notifications that a transaction completed, not posting triggers.
- The **Account Resolution Service** (`resolution/`) — the only thing under
  `js/services/accounting/**` that reads `accounts`/`accounting_settings`. A posting
  provider resolves a business role (`salesAccount`, `outputCgstAccount`, ...) to a real
  `accountId` through this and nothing else.
- The **posting pipeline and persisted schema**: `accounts`, `fiscal_periods`,
  `journal_entries`, `journal_lines`, `accounting_settings`, `journal_number_counters`
  (`schema.sql`), plus `post_journal_entry()`/`reverse_journal_entry()`/
  `next_journal_number()` (`accounting_rpc.sql`) — the only write path; RLS on every one of
  these tables is select-only for clients. `post_journal_entry()` is idempotent on
  `(company_id, ref_table, ref_id)`.
- **Automatic posting providers for Sales, Purchase, and Manufacturing** (`providers/`) —
  the three domains whose money was already fully computable. Stock adjustment posting
  remains deferred indefinitely: double-entry accounting requires financial value, not just
  quantity, and the Accounting Platform will not fabricate a costing methodology to
  manufacture one.
- **Journal reversal by journal entry id**, as a standalone, owner/manager-only capability
  independent of ERP-side document cancellation — no `cancel_sale`/`delete_purchase` RPC
  exists anywhere in this codebase. A future ERP cancellation workflow becomes a *consumer*
  of this reversal API, not a prerequisite for it.
- **ERP integration**: `sale.html`/`purchase.html`/`manufacturing.html` each register their
  own posting provider at load and call `AccountingPlatform.post()` as a second,
  best-effort step once their own RPC succeeds — a posting failure never blocks, delays, or
  rolls back the underlying business transaction; it surfaces as a second, distinct toast
  via the shared `describePostingFailure()`.

Verified live against a real Supabase staging project (25/25 checks — see
`database/validation/accounting/milestone_15b_validation.sql`), plus 45 new client-side
checks (`js/services/accounting/posting/postingPipeline.test.html`) against injected mocks.
Full existing regression unchanged: 1540/1540 + 116/116 (15A). Tag `journal-engine-v1.0`.

Import posting through the same façade and a queue/batch integration with the Background
Job Platform (11D) remain not yet built — no measured performance problem has motivated
either.

**Deferred to future, separately-scoped sub-milestones (15C+), each audited independently
when taken up**: Manual Journal Engine, Posting Preview, Posting History, Posting
Approval, and Recurring Journals. Each introduces its own distinct workflow, user
interaction, persistence shape, or scheduling concern and does not belong bundled into the
automatic-posting slice above.

**Milestone 15C (Manual Journal Engine) is complete and merged.** It adds the ability for
a user to create a journal entry by hand rather than through an automatic posting
provider. A repository audit found the persisted schema already anticipated this case —
`journal_entries.ref_table`/`ref_id` are nullable specifically because manual journals and
reversals have no source document, and `post_journal_entry()`'s own payload comment already
lists `"journal"` as a valid `voucher_type` — so 15C required **zero schema change and zero
new RPC**. The only new platform code is one more posting provider,
`providers/manualJournalPostingProvider.js`, registered for `VOUCHER_TYPES.JOURNAL`: unlike
Sales/Purchase/Manufacturing's providers, it resolves no business role at all — the lines
it builds already carry real `accountId`s the user chose through a direct, RLS-scoped read
of the `accounts` table (the same pattern `sale.html`'s own item search already uses), so
`buildJournalEntry()` is a pass-through, not a resolver. The new UI, `journal.html` +
`js/manualJournal.js`, is the platform's first screen and establishes `menu.html`'s new
"Accounting" section as the permanent home for every accounting screen this platform ships
from here on, not a one-off row. Persisted draft support was explicitly out of scope for
15C and remains so: `journal_entries` has no draft/status column and no draft-write RPC
exists to model one on.

**Purchase Posting hotfix (found during 15C's own production readiness review, merged
separately, not a milestone in its own right):** live staging validation against a real
Supabase project surfaced a pre-existing 15B defect — a blank Purchase Bill Number produced
an empty-string `reference`, which `createJournalEntry()` correctly rejected, but the
resulting exception escaped `postingFacade.js`'s `post()` uncaught (only
`buildJournalEntry()` was try/caught) and surfaced in the UI as a false "Save failed," even
though the purchase itself had already committed. Fixed at both the specific input
(`purchasePostingProvider.js`: `reference: billNo || null`) and the general case
(`postingFacade.js`'s `createJournalEntry()` call now returns `VALIDATION_FAILED` instead
of throwing) — the second change protects every posting provider from the same exception
class, not just Purchase.

**Milestone 15D (Journal Inquiry Platform) is complete and merged.** 15D is
**read-only**: zero changes anywhere in the posting pipeline, Journal Engine, Account
Resolution, schema, RPCs, RLS, or Manual Journal Engine. It adds a Journal Register
(`journal-register.html`, filterable by date range/voucher type/posting source/account/text
search, server-paginated via Supabase `.range()`, never a client-side fetch-all) and a
Journal Detail (`journal-detail.html?id=<journal_entry_id>`, mandatory id, an
invalid/missing/inaccessible id renders "Journal not found" rather than throwing), both
reading exclusively through one new data-access module, `js/journalRegisterData.js` —
neither screen queries Supabase directly. Manual/Reversal/Duplicate-reference indicators
and the Detail page's balanced check are all derived, display-only computations; the
balanced check specifically reuses the platform's own public
`computeEntryTotals()`/`isBalanced()` rather than re-deriving a sum. Deep-link navigation
to the original Sale/Purchase/Manufacturing record is deliberately deferred — no such
single-record viewer exists anywhere in this app for any entity today, so Journal Detail
shows that provenance (voucher type, reference, source table, source record id) as plain
read-only text, not a link, until a future cross-module navigation milestone exists to
integrate with. Tag `journal-inquiry-platform-v1.0`.

**Milestone 15E (General Ledger Platform) is complete.** Same **read-only** posture as
15D: zero changes anywhere in the posting pipeline, Journal Engine, Account Resolution,
Manual Journal Engine, `accounting_rpc.sql`, or RLS. Its one schema change is additive and
non-destructive — a single new view, `v_journal_ledger_lines` (`schema.sql` §29), not a
table, and no migration of existing data. The view is the canonical per-account
running-balance projection this milestone establishes for every future ledger-derived
screen to compose on (Trial Balance, Profit & Loss, Balance Sheet — see ADR-0012, which
also records why a view rather than a `security invoker` RPC is the right shape for this
codebase: PostgREST aggregate functions are confirmed disabled on this project, and a
plpgsql function body is a planner optimization barrier a plain view is not). `ledger.html`
shows one account's full transaction history at a time — filterable by date range/voucher
type/posting source/text search, server-paginated the same way 15D's register is — with
opening/running/closing balance sourced entirely from the view's own `running_balance`
column, through one new data-access module, `js/ledgerData.js`. Zero client-side balance
computation anywhere in either file. Opening and closing balance are computed against the
account's complete history bounded only by the date window, deliberately unaffected by the
voucher-type/posting-source/search row-display filters, since those narrow which rows are
*shown*, not what actually happened to the account's balance before them.

**Milestone 15F (Trial Balance Platform) is complete.** Same **read-only** posture as
15D/15E, and — unlike 15E — **zero schema change of any kind**: no new table, view, or
RPC. Before implementation, a dedicated architecture review (ADR-0013) evaluated every
plausible single-query technique for "every account's balance as of a selectable date" —
`DISTINCT ON`, ranking window functions, `GROUP BY` with a join-back, `LATERAL` joins,
CTEs — and proved each one wrong for an arbitrary *historical* date: every one of them
picks a single row per account before a client-supplied date filter can apply, and
PostgREST cannot inject that filter earlier. The one single-query shape that is correct
requires a parameterized RPC, which this milestone's scope excludes — so Trial Balance
composes via a bounded, parallel fan-out over `js/ledgerData.js`'s existing `balanceAt()`,
one call per account in the chart of accounts (bounded by account count, not transaction
volume), reusing the exact prefix-sum property 15E already established as correct for a
historical date. `trial-balance.html` buckets each account's balance into Debit or Credit
via a shared, pure helper (`bucketSignedBalance()`, promoted out of `ledger.html` into
`js/ledgerData.js` so neither screen duplicates the logic), shows grand totals that tie
out as a consequence of `post_journal_entry()`'s own balance guarantee, drills down into
`ledger.html?account=<id>` (a small, additive, backward-compatible URL contract added to
`ledger.html` for this purpose), and exports CSV directly via the Reporting Platform's
standalone `export/csvExport.js` — without registering as a Reporting Platform report.
Unlike 15D/15E, this milestone ships a dedicated offline test file
(`js/trialBalanceData.test.html`, 21 checks) for its own new pure logic.

**Milestone 15G (Profit & Loss Platform) is implemented and validated on its own branch
(`milestone-15g-profit-loss-platform`), but is NOT merged, NOT tagged, and NOT released**
— this paragraph describes it; it is deliberately absent from §3's Completed Milestones
table and §8's Repository Checkpoints, and will stay absent until Git actually shows it
merged and tagged, exactly the convention 12C/12D followed before them.

Before implementation, a dedicated architecture review (ADR-0014) recorded which
`accounts.category` values belong on the statement — a question Trial Balance never had
to answer, since a formal trial balance deliberately includes every account regardless
of category. ADR-0014's closed inclusion list: `income` (Revenue), `directExpenses`
(nets against Revenue for Gross Profit), `indirectExpenses` and the generic `expenses`
(both net against Gross Profit for Net Profit) — every other category, closed or
custom, is excluded from the statement by default, never by a silent guess. It composes
the same way 15F did: a bounded fan-out over `js/ledgerData.js`'s `balanceAt()`, called
twice per included account (period-start and period-end, net movement = closing minus
opening) rather than once, since a P&L is a period figure, not an as-of-date balance —
**no new schema object, no new RPC, no change to the posting pipeline, and no change to
15E/15F's own modules.** `profit-loss.html` + `js/profitLossData.js`, plus a dedicated
offline test file (`js/profitLossData.test.html`, 31 checks) following 15F's precedent.

**One Accounting Foundation defect was found and fixed during 15G's production-readiness
review, and it is the only change this milestone makes outside its own new files.**
Account 9000 `Rounding Off` — the account `bootstrap_accounting_defaults()` seeds for the
`roundingAccount` role — was categorised `suspense`, which ADR-0014 correctly excludes
from P&L. But both production posting paths that write to it
(`salesPostingProvider.js`/`purchasePostingProvider.js`) post a *realised* rounding gain
or loss, and nothing in this codebase ever clears the account. Left alone it would have
kept rounding differences permanently out of Net Profit, and — because ADR-0014 invites
Balance Sheet (15H) to cite its excluded list as 15H's own included set — would have
routed them onto the Balance Sheet where they could never be cleared. The fix is a
one-string seed correction in `schema.sql` §23 (`suspense` → the existing
`indirectExpenses`), plus a one-time backfill of the single account-9000 row in each
already-provisioned company, since the seed inserts `ON CONFLICT DO NOTHING`. No new
category was invented, the closed inclusion list was not widened, the `suspense` category
remains excluded, `normal_balance` is unchanged, posting logic is unchanged, and
`js/profitLossData.js` contains no reference to account 9000 — see ADR-0014's own
"Account 9000" subsection.

## 7. Living Architecture Documents

These remain the authoritative implementation references for each platform. This roadmap
does not repeat their content and does not move or rename them — it only points to them:

- `event-bus-architecture.md` — the Domain Event Bus
- `diagnostics-architecture.md` — Diagnostics & Observability
- `job-engine-architecture.md` — the Background Job Engine
- `audit-platform-architecture.md` — the Audit Platform
- `extension-framework-architecture.md` — the Plugin & Extension Framework
- `data-exchange-architecture.md` — the Data Exchange Platform (XML/JSON/backup-restore/Migration Engine)
- `business-intelligence-platform.md` — the Business Intelligence Platform's permanent conceptual reference ("read this before changing anything" — platform overview, layer diagram, domain responsibilities, composition flow, BusinessSnapshot, extension points, caching, refresh flow, diagnostics, audit, version history, and the Frozen Architecture governance rule as of v2.0/Milestone 12F). Not an implementation guide or an API contract — see the next two entries for those.
- `business-intelligence.md` — the Business Intelligence Platform architecture reference (Inventory Intelligence, 12A; Purchase Intelligence, 12B; Sales Intelligence, 12C; Pricing Intelligence, 12D; Supplier Intelligence, 12E; Business Dashboard, 12F; v2 feature work — see §6)
- `business-intelligence-api.md` — the Business Intelligence Platform's public API contract (every `getX()`/`generateX()` function, shared models, versioning policy — additive to, not a replacement for, `business-intelligence.md`)
- Migration Engine design: `milestone-9f-migration-engine-design.md`
- JSON Platform design/report: `milestone-10-json-design.md`, `milestone-10-json-report.md`
- `milestone-8.2-design-system.md` — the Design System (visual/interaction single source of
  truth), including §22, the Product Experience Foundation amendment (loading state, skeleton,
  content placeholder, reduced motion, focus-ring standardization) Milestone 13A added under its
  own §21 governance procedure
- `reporting-platform-architecture.md` — the Reporting Platform's permanent architecture
  reference (Milestone 14A): Report Registry, Definition Contract, Lifecycle, Context,
  shared Report Shell, Print Framework, Export Framework. As of Milestone 14C, 23 real
  reports are registered against this foundation, unmodified except for two additive
  filter-key extensions added in 14B — see
  `docs/releases/reporting-platform-operational-reports-v1.0.md` and
  `docs/releases/reporting-business-analysis-reports-v1.0.md`
- `accounting-platform-architecture.md` — the Accounting Platform's permanent architecture
  reference. Milestone 15A built the foundation (Chart of Accounts, Account/Journal/
  Voucher Type/Posting Provider Contracts, Balanced Entry Validation, Fiscal Period
  Platform); Milestone 15B added its first real consumer (the `AccountingPlatform.post()`/
  `.reverse()` façade, the Account Resolution Service, automatic posting for Sales/
  Purchase/Manufacturing, and the persisted schema/RPCs); Milestone 15C added the platform's
  first UI (`journal.html`, manual journal entry); Milestone 15D added its first read-only
  consumer (`journal-register.html`/`journal-detail.html`); Milestone 15E added the General
  Ledger (`ledger.html`, `v_journal_ledger_lines`, ADR-0012); Milestone 15F added Trial
  Balance (`trial-balance.html`, `js/trialBalanceData.js`, ADR-0013) with zero further
  schema change. See `docs/releases/accounting-platform-foundation-v1.0.md` (15A) —
  15B/15C/15D/15E/15F have no separate release checkpoint documents, only their tags
  (`journal-engine-v1.0`, `journal-inquiry-platform-v1.0`, `general-ledger-platform-v1.0`,
  `trial-balance-platform-v1.0`; 15C is untagged, folded into
  `journal-inquiry-platform-v1.0`'s history). Milestone 15G (Profit & Loss) is implemented
  on its own branch but not merged and not tagged — see §6.

`platform-roadmap.md` is a navigation document only — when architecture and this roadmap
ever appear to disagree on a detail, the living architecture document is authoritative.

## 8. Repository Checkpoints

| Checkpoint | Represents |
|---|---|
| `json-platform-v1.0` | Completion of the Universal JSON Data Exchange Platform (Milestone 10) — canonical JSON established alongside Tally XML as an interchange format. |
| `infrastructure-platform-v1.0` | Completion of Milestones 11A–11D as one consolidated architectural checkpoint — the Domain Event Bus, its integration into the real ERP, the Diagnostics Platform, and the Background Job Engine. |
| `audit-platform-v1.0` | Completion of Milestone 11E — the Audit Platform, subscribing directly to Domain Events as a peer of Diagnostics and the Job Engine. |
| `extension-framework-v1.0` | Completion of Milestone 11F — the Plugin & Extension Framework, closing the approved infrastructure roadmap (11A–11F). |
| `inventory-intelligence-v1.0` | Completion of Milestone 12A — the Inventory Intelligence Platform, the first v2 feature built on the closed infrastructure roadmap. |
| `purchase-intelligence-v1.0` | Completion of Milestone 12B — the Purchase Intelligence Platform, extending the same Business Intelligence layer with a second domain. |
| `sales-intelligence-v1.0` | Completion of Milestone 12C — the Sales Intelligence Platform, extending the same Business Intelligence layer with a third domain. Commit `98ec671`. |
| `pricing-intelligence-v1.0` | Completion of Milestone 12D — the Pricing Intelligence Platform, extending the same Business Intelligence layer with a fourth domain. Commit `142c963`. |
| `product-experience-foundation-v1.0` | Completion of Milestone 13A — the Product Experience Foundation: a shared dialog/button/loading-state UX infrastructure layer, built under a governed Design System §22 amendment and proven against one reference screen (`stock.html`). Merge commit `aaa6aa7`. |
| `product-experience-migration-v1.0` | Completion of Milestone 13B — the Product Experience Migration: all seven remaining business screens migrated onto the 13A shared layer, plus two new shared factories (`segmentedToggle.js`, `searchResults.js`) built for their first real consumers. |
| `executive-command-center-v1.0` | Completion of Milestone 13C — the Executive Command Center: `dashboard.html`, the Business Dashboard Platform's (12F) first UI consumer, built entirely on the 13A/13B Product Experience layer with zero new shared component and zero Business Intelligence change. |
| `reporting-platform-foundation-v1.0` | Completion of Milestone 14A — the Reporting Platform Foundation: a new `js/services/reporting/` infrastructure platform (Report Registry, Definition Contract, Lifecycle, Context, shared Report Shell, Print Framework, Export Framework), resolving Milestone 13D's documented block. Zero actual reports, zero Business Intelligence change; proven live via `reports.html`, a real hub screen showing an honest empty registry. Governed by ADR-0003 (registry shape, permissions, extension points) and ADR-0004 (data access strategy for Milestone 14B). |
| `reporting-operational-reports-v1.0` | Completion of Milestone 14B — Reporting Platform Operational Reports: 12 registered reports across 8 screens built on the unmodified 14A foundation, spanning Sales/Purchase/Stock Register (ERP), Current Stock/Low Stock/Negative Stock/Customer Purchase Profile/Supplier Purchase Profile (Business Intelligence, zero new calculation), and Customer/Supplier Ledger/Outstanding (a mix of reuse and 4 new narrow ERP providers). Governed by ADR-0004 and the new ADR-0005 (Operational Report Data Provider Pattern). Full detail: `docs/releases/reporting-platform-operational-reports-v1.0.md`. |
| `reporting-business-analysis-reports-v1.0` | Completion of Milestone 14C — Reporting Platform Business Analysis Reports: 11 more registered reports across 8 screens (23 total across 16 screens), 100% Business-Intelligence-sourced, zero new ERP providers, zero changes to `js/services/reporting/` or `js/services/businessIntelligence/`. Governed by the new ADR-0006 (Business Analysis Report Pattern). Full detail: `docs/releases/reporting-business-analysis-reports-v1.0.md`. |
| `accounting-platform-foundation-v1.0` | Completion of Milestone 15A — the Accounting Platform Foundation: a new `js/services/accounting/` infrastructure platform (Chart of Accounts, Journal/Voucher Type/Posting Provider Contracts, Balanced Entry Validation, Fiscal Period Platform). Zero consumers, zero persistence, zero UI, zero schema change; proven live only by its own 116-check test suite. Governed by five new ADRs (0007–0011: scope evolution, integer-minor-units money, two-sided journal lines, open-catalog/closed-derivation normal balance, throw-vs-result validation). Full detail: `docs/releases/accounting-platform-foundation-v1.0.md`. |
| `journal-engine-v1.0` | Completion of Milestone 15B — the Journal Engine: `AccountingPlatform.post()`/`.reverse()` (the only write entry point Sales/Purchase/Manufacturing ever call), the Account Resolution Service, automatic posting providers for Sales/Purchase/Manufacturing, and the persisted schema/RPCs (`accounts`, `fiscal_periods`, `journal_entries`, `journal_lines`, `accounting_settings`, `journal_number_counters`, `post_journal_entry()`, `reverse_journal_entry()`, `next_journal_number()`). Verified live against a real Supabase staging project (25/25 checks); 45 new client-side checks. This tag's history also carries 15C (Manual Journal Engine, `journal.html`) and the Purchase Posting hotfix, neither separately tagged. |
| `journal-inquiry-platform-v1.0` | Completion of Milestone 15D — the Journal Inquiry Platform: the Accounting Platform's first **read-only** consumer, `journal-register.html` + `journal-detail.html` + `js/journalRegisterData.js`. Zero changes to the posting pipeline, Journal Engine, Account Resolution, schema, RPCs, RLS, or Manual Journal Engine. Verified by live staging validation; no new `postingPipeline.test.html` checks (nothing in the posting pipeline changed). |
| `general-ledger-platform-v1.0` | Completion of Milestone 15E — the General Ledger Platform: one account's full transaction history with a running balance, `ledger.html` + `js/ledgerData.js`, composing on one new additive view, `v_journal_ledger_lines` (ADR-0012) — no new table, no cached/persisted balance. Live validation found and fixed two real defects: a missing `security_invoker` clause causing an RLS bypass, and an opening balance that silently showed the account's current balance instead of zero when no start date was set. Regression 1715/1715. |
| `trial-balance-platform-v1.0` | Completion of Milestone 15F — the Trial Balance Platform: every account's balance as of a selectable date bucketed into Debit/Credit with a tie-out check, `trial-balance.html` + `js/trialBalanceData.js`. **Zero new schema object of any kind** — ADR-0013 proved every single-query technique wrong for an arbitrary historical date and established the bounded, parallel fan-out over 15E's existing `balanceAt()` as the only correct option without a new RPC. First accounting milestone with a dedicated offline test file (`js/trialBalanceData.test.html`, 21 checks). Regression 1736/1736. |

Full verification detail for each checkpoint (regression figures, files changed, known
limitations) lives in its own record under `docs/releases/`.

## 9. Future Documentation Rules

Permanent rules for how this repository's documentation grows:

- Every major platform receives exactly one living architecture document.
- Every completed architectural phase receives exactly one release checkpoint.
- Historical design documents are never rewritten to reflect information learned after
  they were written.
- Living architecture documents may evolve as their platform is extended.
- Milestone reports remain historical records of what was built and verified at the
  time.
- This roadmap is updated only when an architectural phase is completed — not for every
  milestone, and not speculatively ahead of approved work.

## 10. Documentation Reading Order

New contributors (human or AI) should read the documentation in this order:

1. `platform-roadmap.md` (this document)
2. Latest infrastructure release checkpoint
3. Latest completed milestone report
4. Platform architecture documents
5. Implementation documents
6. Source code

This order prevents misunderstanding the project's architecture and historical
decisions.

## 11. Architectural Principles

The following principles govern every future change to ApnaBill.

- Preserve completed architecture.
- Prefer extension over replacement.
- Prefer evolution over rewriting.
- Business logic remains synchronous.
- Infrastructure reacts through Domain Events.
- Diagnostics observe but never control.
- Jobs never execute business logic.
- Audit records facts only.
- Plugins extend the platform without modifying the core.
- Database schema is treated as stable unless a future milestone explicitly changes it.

## 12. Before Starting Any New Milestone

Every future development session should:

☐ Read `platform-roadmap.md`

☐ Read the latest release checkpoint.

☐ Read the architecture document for the platform being modified.

☐ Read the previous milestone report.

☐ Verify current Git tag.

☐ Respect completed architectural decisions.

☐ Prefer additive changes over modification.

☐ Preserve regression compatibility.

No implementation should begin before these steps are completed.
