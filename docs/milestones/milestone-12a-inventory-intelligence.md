# Milestone 12A — Inventory Intelligence Platform: Design

## 1. Goals

Build a read-only Business Intelligence layer over the existing, already-complete
Inventory/Items/Purchases/Sales modules: inventory value, turnover, low/out-of-stock,
dead/slow/fast-moving classification, category performance, and reorder recommendations.
Think Vyapar/Zoho Inventory-style business intelligence — deterministic calculations over
existing data, not artificial intelligence, not machine learning, not prediction.

## 2. Current architecture (as it exists today)

Read in full before any code was written: `docs/architecture/platform-roadmap.md`,
`docs/releases/platform-v2-foundation.md`, all five Milestone 11 architecture references
(`event-bus-architecture.md`, `diagnostics-architecture.md`, `job-engine-architecture.md`,
`audit-platform-architecture.md`, `extension-framework-architecture.md`) and their
completion reports, `js/items.js`, `js/purchases.js`, `js/sales.js`, and `schema.sql`.
Three facts from that reading shaped this design directly:

1. **The Infrastructure Platform (11A–11F) is complete and stable, and exists precisely
   to be built on without modification.** `platform-v2-foundation.md` names the shape "v2"
   work is expected to take — a real extension, a real persistent store, wiring an
   unwired event type — and this milestone follows that shape: it consumes
   `events/`, `diagnostics/`, `jobs/`, `audit/`, and `extensions/` through their public
   barrels, and extends exactly two of them (`events/registry/eventTypes.js` and
   `audit/registry/auditRegistry.js`) using their own documented "add one entry" extension
   mechanism, plus one job registered via `jobs/`'s own documented
   `startBackgroundInfrastructure()` extension point.
2. **The database schema is frozen.** `items` has no `category` column, no reservation
   concept, and non-batch-tracked items have no running-balance column at all (only
   `stock_ledger`'s full history). Every metric this milestone reports is designed around
   what the schema actually contains, with every gap disclosed rather than worked around
   with a schema change (see `docs/architecture/business-intelligence.md` §6).
3. **"One inventory scan powers multiple insights."** The brief's own architecture
   diagram — `ERP -> Metrics -> Calculators -> Aggregators -> Insight Models -> Business
   Intelligence Services -> Dashboard/Reports/Extensions` — is a pipeline, not a set of
   independent per-insight queries. `inventory/inventoryDataLoader.js` is the only file
   that touches Supabase, and it runs a fixed, small number of queries regardless of how
   many `getX()` functions are later called.

## 3. Non-goals (explicit, from the brief)

Not built here: a Dashboard UI, Sales Intelligence, Purchase Intelligence (Milestone
12B), automated purchasing, purchase-order creation, artificial intelligence/ML. Not
modified here: inventory logic, stock movement, purchase/sale/manufacturing workflows,
reports, imports/exports, infrastructure, diagnostics' own logic, the Job Engine's
dispatch pipeline, the Audit Platform's record contract, the Extension Framework's
lifecycle manager, the database schema (no table renamed, no column renamed, no table
added).

## 4. Key design questions answered

**Where does this platform live?** `js/services/businessIntelligence/`, a sibling of
`events/`, `diagnostics/`, `jobs/`, `audit/`, and `extensions/` — depending on all five of
their public barrels, the same shape `extensions/` itself established as "the platform
that depends on all the others; none of them import back from it."

**Why does it need to touch `events/registry/eventTypes.js` and
`audit/registry/auditRegistry.js` at all, if it's supposed to be additive-only?** Because
the milestone's own brief requires it: "Audit only: Generated reports, Dashboard exports,
Scheduled BI jobs. Reuse the existing Audit Platform." The only way to get a fact into the
existing Audit Platform is a real Domain Event it observes — there is no side-channel
"write an audit record directly" API, by that platform's own design (`audit/` only
subscribes to `ALL_EVENTS`). Both registries' own architecture references document
"add one entry" as the sanctioned, zero-blast-radius way to extend them (`bus/eventBus.js`
needs no change; neither does `subscriber/auditSubscriber.js`) — this milestone uses
exactly that mechanism, once, for one new event type
(`EVENT_TYPES.INVENTORY_INSIGHT_GENERATED`).

**Why is only `generateInventoryInsightReport()` audited, and not every `getX()`?** The
brief is explicit: Business Intelligence is read-only and "do NOT audit every query."
Routine reads (`getInventorySummary`, `getLowStockItems`, etc.) never call
`biAuditReporter.js`; only an explicit report/export/scheduled-job invocation does.

**Why register a job with the existing Job Engine instead of building a scheduler?** The
brief again: "if expensive calculations exist, cache them using scheduled jobs... do NOT
create another scheduler." `jobs/refreshInventoryInsightsJob.js` is one ordinary
`JobDefinition`, registered via `jobs/bootstrap/startBackgroundInfrastructure.js`'s own
documented extension point (`docs/job-engine-architecture.md` §11), triggered by the four
events that can change an inventory insight's answer.

**What does `hsn_sac` have to do with "category"?** Nothing, formally — `items` has no
category column, and the schema is frozen. `hsn_sac` (the GST tax-classification code
every item already carries) is the closest existing grouping dimension that behaves like
a product category in Indian retail practice, used here as a deliberate, disclosed proxy
(`calculators/categoryCalculator.js`), not a new schema concept.

**Why is `reservedStock` always 0?** The schema has no sales-order or reservation
concept anywhere — no table holds a "committed but not yet shipped" quantity. Rather than
silently omitting the field (the brief explicitly names "Reserved Stock (if existing)"),
`metrics/itemMetrics.js` reports it as `0` with `availableStock` always equal to
`currentStock`, documented in code and here.

## 5. Testing approach

Every calculator, aggregator, model builder, and the diagnostics/cache/audit/extension
helpers are pure or dependency-injectable, and are unit-tested directly against a
hand-built, deterministic `InventorySnapshot` fixture — no real Supabase call anywhere in
the test suite. `api/inventoryIntelligenceApi.js`'s `createInventoryIntelligenceApi({
loadSnapshot, cache, diagnostics, recordAudit, resolveActiveCompanyId })` dependency-injection
seam is what makes this possible; the real application uses the exported
`inventoryIntelligence` singleton, wired to the real loader. This mirrors the same,
already-disclosed limitation every other Core ERP file in this codebase has ("No Core ERP
file has an automated test harness... verified by code review, not a suite" —
`docs/releases/platform-v2-foundation.md`) — `inventory/inventoryDataLoader.js`'s own four
Supabase queries are reviewed by inspection, the same as `js/items.js`/`js/purchases.js`/
`js/sales.js` always have been.

## 6. Reading order for whoever picks this up next

1. `docs/architecture/platform-roadmap.md`
2. `docs/releases/platform-v2-foundation.md`
3. This document
4. `docs/architecture/business-intelligence.md` (the living reference)
5. `docs/reports/milestone-12a-completion.md`
6. `js/services/businessIntelligence/index.js` and its `businessIntelligence.test.html`
