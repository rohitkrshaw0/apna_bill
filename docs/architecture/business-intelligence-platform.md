# Business Intelligence Platform

> **Version 2.0 — FROZEN ARCHITECTURE**
> As of Milestone 12F (tag `business-dashboard-v2.0`). Read this document before
> changing anything under `js/services/businessIntelligence/`.

## Purpose of this document

This is the **permanent, conceptual reference** for the Business Intelligence
Platform — not an implementation guide, not an API contract, not a milestone report. It
exists so a future contributor (human or AI) can understand what this platform *is*, why
it is shaped the way it is, and what is and is not allowed to change, without reading six
milestones' worth of design docs first. Three other documents remain authoritative for
their own narrower purpose, and this one does not duplicate them:

| Document | Scope |
|---|---|
| `docs/architecture/business-intelligence.md` | The living, evolving implementation reference — module maps, per-domain architecture sections (§§4–24), dependency graphs, reuse audits. Read this for *how* a specific domain works. |
| `docs/architecture/business-intelligence-api.md` | The public API contract — every `getX()`/`generateX()` function's exact input/output shape, every shared model's exact field list, the versioning policy. Read this for *exactly what a function returns*. |
| `docs/architecture/platform-roadmap.md` | The whole-repository navigation document — where the BI Platform fits among the Core ERP, Data Exchange, and Infrastructure Platforms. Read this first, before any of the above. |
| **This document** | *Why* the platform is shaped this way, and the governance rules for changing it. Read this before touching anything, then go to the table above for details. |

## 1. Platform Overview

The Business Intelligence Platform (`js/services/businessIntelligence/`) is ApnaBill's
read-only analytics layer. It converts data the Core ERP already stores — items,
batches, purchases, sales, suppliers — into reusable insights, without ever modifying the
ERP, and without any consumer (Dashboard, Report, Mobile App, Extension) ever computing a
number itself.

It was built incrementally, six domains across six milestones, each one either computing
something new from the ERP or composing what earlier domains already computed:

| Domain | Milestone | What it adds |
|---|---|---|
| Inventory Intelligence | 12A | Inventory value, turnover, stock-health classification |
| Purchase Intelligence | 12B | Purchase price history, trend, supplier comparison |
| Sales Intelligence | 12C | Sales revenue, margin, customer ranking, seasonality |
| Pricing Intelligence | 12D | Margin %, markup %, discount %, price stability — composing Purchase + Sales |
| Supplier Intelligence | 12E | Supplier performance/contribution — composing Purchase + Pricing + Sales + Inventory |
| Business Dashboard | 12F | Zero-logic composition of all five domains into one snapshot + renderable cards |

Despite six domains, this is **one platform, not six** — one shared cache, one shared
diagnostics instance, one shared calculation library, one audit bridge, one extension
contract set, one versioning number (currently **v2.0**). Every domain after the first
was built by extending this same platform, never by starting a parallel one.

## 2. Layer Diagram

The permanent pipeline every domain is built on, and never deviates from:

```
Core ERP (read only)
  ↓
Data Loaders          -- the ONLY files that touch Supabase; one per domain that
                          needs one (Inventory/Purchase/Sales/Pricing); Supplier and
                          Business Dashboard have NONE of their own (§4)
  ↓
Metrics                -- per-item / per-supplier / per-entity numeric facts
  ↓
Calculators             -- pure, reusable arithmetic (the Shared Calculation Library, §3)
  ↓
Aggregators             -- combine metrics into lists/summaries; never duplicate calculator logic
  ↓
Insight Models          -- structured, frozen, assembled-only response shapes
  ↓
Business Intelligence APIs  -- the ONLY layer any consumer imports from
  ↓
Business Snapshot Provider  -- composes all five domain APIs into one immutable object (12F)
  ↓
Dashboard Provider           -- maps a BusinessSnapshot into renderable Dashboard Cards (12F)
  ↓
Consumers (Dashboard UI, Reports, Mobile/Desktop App, Extensions, future APIs)
```

**No consumer, at any layer, skips a layer.** A Dashboard Card never reaches into
`metrics/`; a `getXSummary()` function never queries Supabase directly; the Business
Snapshot Provider never recomputes a number a domain API already returned. This is
enforced by convention (verified by `git status`/import-graph review in every
milestone's own completion report), not a runtime guard — but it has held, without
exception, across all six milestones.

## 3. Domain Responsibilities

| Domain | Own data loader? | Composes | Genuinely new calculation |
|---|---|---|---|
| Inventory (12A) | Yes (`inventory/inventoryDataLoader.js`) | — | Inventory valuation, turnover, movement classification |
| Purchase (12B) | Yes (`purchase/purchaseDataLoader.js`) | — | Price history, cost trend, supplier comparison |
| Sales (12C) | Yes (`sales/salesDataLoader.js`) | — | Revenue (gross/net/returns), gross margin |
| Pricing (12D) | Yes, but composes rather than duplicates (`pricing/pricingDataLoader.js` calls `loadPurchaseSnapshot()`/`loadSalesSnapshot()` + one new `items` query) | Purchase, Sales | Margin %, markup %, discount %, price volatility — all via the **single shared percentage calculator** (§3 in `business-intelligence-api.md`, `calculators/percentageCalculator.js`) |
| Supplier (12E) | **None** | Purchase, Pricing, Sales, Inventory (all four sibling APIs) | Revenue/margin/inventory contribution across a supplier's own item set — everything else reused verbatim |
| Business Dashboard (12F) | **None** | Inventory, Purchase, Sales, Pricing, Supplier (all five) | **Nothing.** Zero new metrics, calculators, or aggregators — pure selection/composition |

The rightmost column is not incidental — it is the platform's own trend line. Each
domain reuses strictly more of what came before it than the one before it did (see each
domain's own Reuse Audit in `docs/reports/milestone-12*-completion.md`), culminating in
12F, which computes nothing at all.

## 4. Composition Flow — the platform's central discipline

Three distinct composition patterns exist in this platform, and any future domain
should recognize which one it needs before writing a line of code:

1. **Scan once, compute many** (12A–12C): one domain, one data loader, one metrics
   pass, N aggregators/API functions reading that same metrics array. The baseline
   pattern every domain starts from.
2. **Compose sibling loaders** (12D): a domain that needs two other domains' raw data
   calls their *loaders* directly (`loadPurchaseSnapshot()`, `loadSalesSnapshot()`) and
   adds only the one query neither already runs. Appropriate when the new domain's own
   value is a genuinely new calculation over combined raw data.
3. **Compose sibling APIs** (12E, 12F): a domain whose own value is aggregating or
   presenting other domains' *already-computed intelligence* — not raw data — calls
   their public `getXSummary()`/`getXMetricsSnapshot()` functions instead, via
   dependency injection (`createXApi({ purchaseIntel, pricingIntel, ... })` rather than
   `createXApi({ loadSnapshot })`). This is the pattern for any domain that presents,
   ranks, or summarizes intelligence rather than deriving new intelligence from raw rows.

**The permanent rule going forward: a new domain composing existing intelligence
injects the sibling domains' own public API instances, never their metrics/calculators/
aggregators directly, and never a raw Supabase query for data another domain's loader
already fetches.** This is what kept Supplier Intelligence and the Business Dashboard
from becoming parallel analytics engines.

## 5. Public Contracts

`docs/architecture/business-intelligence-api.md` is the single source of truth for every
function signature — this document does not repeat them. What matters here is the
**contract discipline**, restated from that document's own §3/§13:

- Every function name, parameter shape, and return shape, once documented, does not
  change without a major version bump.
- New optional parameters and new fields on a returned model may be added freely
  (additive). Removing or renaming an existing one requires a major version bump and an
  explicit migration note.
- A new domain is always a **minor** version bump on the same platform (v1.0 → v1.4);
  a major version bump (v1.4 → v2.0) is reserved for a genuinely new *consumption
  model* — which is exactly what Business Dashboard was, and the only one so far.

Six public API objects exist, every one importable from `js/services/businessIntelligence/index.js`
only — never from an individual subfolder:

```js
import {
  inventoryIntelligence,   // 12A
  purchaseIntelligence,    // 12B
  salesIntelligence,       // 12C
  pricingIntelligence,     // 12D
  supplierIntelligence,    // 12E
  businessDashboard        // 12F
} from 'js/services/businessIntelligence/index.js';
```

## 6. BusinessSnapshot

The platform's own top-of-the-funnel object (Milestone 12F, `models/businessSnapshotModel.js`):
one immutable, deep-frozen composition of all five domain summaries, plus three derived
views (`recommendations`, `alerts`, `kpis`) that are pure selections/filters over
already-computed data — never a new calculation. Full field-by-field shape:
`business-intelligence-api.md` §10; full rationale for every design choice (why
`dashboardCards` is not one of its fields, why `alerts` filters on already-named
booleans): `business-intelligence.md` §24.5.

`BusinessSnapshot` is meant to outlive the Dashboard that first consumed it — any future
consumer (a Mobile App, a scheduled report, a different UI) that wants "the whole
business state in one immutable object" should call `businessSnapshotProvider.getBusinessSnapshot()`
directly, not reimplement the five-domain composition itself.

## 7. Extension Points

Three capabilities, unchanged since Milestone 12A, declared via
`extensions/capabilityNames.js`'s `BI_CAPABILITIES`:

| Capability | Meaning |
|---|---|
| `InventoryInsightProvider` | Additional inventory-level insights alongside this platform's own aggregators |
| `InventoryMetricProvider` | An additional per-item metric alongside `metrics/itemMetrics.js` |
| `DashboardCardProvider` | A renderable card for the Dashboard — covers every domain's own dashboard-facing needs, deliberately with no per-domain equivalent (`PurchaseMetricProvider`, etc. do not exist) |

No new capability was needed by any of Milestones 12B–12F — a strong signal that three
was enough. **`DashboardCardProvider` is declared but not yet wired**:
`businessDashboard.getDashboardCards()` returns only its own static 17-card list; merging
extension-contributed cards into that array is disclosed, unbuilt technical debt
(`business-intelligence.md` §24.11), not a broken contract.

**Permanent extension rules** (unchanged since 11F, restated here because they govern
this platform specifically): an extension may never write to any table this platform
reads from, call any `getX()`/`generateX()` function for a side effect beyond its one
disclosed audit event, register a new Domain Event type, or register a Job Engine job.

## 8. Caching

One shared, in-memory, TTL-based cache (`cache/insightCache.js`'s `insightCache`
singleton) serves every domain — never one cache per domain, never a second cache
implementation. Six collision-free key prefixes coexist in the same `Map`:

| Prefix | Domain |
|---|---|
| `itemMetrics:...` | Inventory (12A) |
| `purchaseMetrics:...` | Purchase (12B) |
| `salesMetrics:...` | Sales (12C) |
| `pricingMetrics:...` | Pricing (12D) |
| `supplierMetrics:...` | Supplier (12E) |
| `businessSnapshot:...` | Business Dashboard (12F) |

Default TTL 5 minutes (`DEFAULT_CACHE_TTL_MS`), lazy expiry (checked on read, never
swept by a timer). `insightCache.invalidateCompany(companyId)` clears **every** prefix
for that company at once — this single property is why Business Dashboard needed no
cache-invalidation logic of its own (§9).

## 9. Refresh Flow

Five registered Background Jobs (Job Engine reuse, Milestone 11D — no new scheduler was
ever built):

| Job | Triggers |
|---|---|
| `refreshInventoryInsightsJob` | `StockAdjusted`, `PurchaseCreated`, `SaleCreated`, `ItemCreated` |
| `refreshPurchaseInsightsJob` | `PurchaseCreated`, `SupplierCreated` |
| `refreshSalesInsightsJob` | `SaleCreated`, `CustomerCreated` |
| `refreshPricingInsightsJob` | `SaleCreated`, `PurchaseCreated` |
| `refreshSupplierInsightsJob` | `PurchaseCreated`, `SupplierCreated` |

Each job, on its own trigger: calls `insightCache.invalidateCompany(companyId)`, then
calls its own domain's `generateXInsightReport({reportType: 'scheduled'})` to recompute
and re-cache (which also records the one audit entry a scheduled run produces, §11).

**Business Dashboard has no sixth job, deliberately.** Since
`invalidateCompany(companyId)` already clears the `businessSnapshot:...` prefix
alongside every other, any one of the five jobs above already keeps the Dashboard's own
cache correctly warm. A future domain that composes existing intelligence (§4, pattern
3) should ask whether it needs a new job at all before writing one — it may not.

## 10. Diagnostics

One shared `biDiagnostics` instance (`diagnostics/biDiagnostics.js`, Diagnostics
Platform reuse, Milestone 11C) — never a per-domain diagnostics recorder. Every public
function records one `bi:<functionName>` timeline entry (execution time, success/
failure), a metrics sample, and cache-hit/cache-miss counters. Read via
`biDiagnostics.stats()` — not itself part of the public consumer-facing surface, but
available to a future Diagnostics Dashboard.

## 11. Audit

The platform is **completely read-only and does not audit routine reads** — only a
`generateXInsightReport()` (or, for the Dashboard, `generateDashboardReport()`) call
records anything, via the existing Audit Platform (Milestone 11E), never a direct
database write. Six audited event types exist, one per domain, each additive to
`events/registry/eventTypes.js` and `audit/registry/auditRegistry.js`:
`InventoryInsightGenerated`, `PurchaseInsightGenerated`, `SalesInsightGenerated`,
`PricingInsightGenerated`, `SupplierInsightGenerated`, `DashboardGenerated`. A future
domain follows the identical pattern: one new event type, one new audit-registry entry,
one narrow `audit/xAuditReporter.js` file — never a new audit mechanism.

## 12. Version History

| Version | Milestone | Delivered | Git tag |
|---|---|---|---|
| v1.0 | 12A | Inventory Intelligence | `inventory-intelligence-v1.0` |
| v1.1 | 12B | Purchase Intelligence | `purchase-intelligence-v1.0` |
| v1.2 | 12C | Sales Intelligence | `sales-intelligence-v1.0` |
| v1.3 | 12D | Pricing Intelligence | `pricing-intelligence-v1.0` |
| v1.4 | 12E | Supplier Intelligence | `supplier-intelligence-v1.0` |
| **v2.0** | **12F** | **Business Dashboard** | **`business-dashboard-v2.0`** |

`docs/architecture/business-intelligence-api.md` §13 (Versioning Policy) remains the
authoritative, function-level record of what each version added or changed. This table
exists here only so the platform's own release history is visible without opening that
document.

## 13. Future Extension Rules — Frozen Architecture

**As of v2.0 (Milestone 12F, tag `business-dashboard-v2.0`), the Business Intelligence
Platform's architecture is FROZEN.** Concretely, frozen means:

- The layer diagram (§2) does not change shape. A new domain is a new set of files in
  the existing folders (`metrics/`, `calculators/`, `aggregators/`, `models/`, `api/`,
  `audit/`, `recommendations/`, optionally its own data-loader subfolder), never a new
  top-level pipeline.
- `BusinessSnapshot`, the Shared Calculation Library (every `calculators/*.js` file),
  the six public API objects (§5), and the composition-root shapes (§4) are **long-term
  platform contracts**. They are extended additively when a genuine new need arises —
  never redesigned, never replaced, never forked into a parallel version.
- The shared cache, diagnostics instance, and extension capability set (§§7–10) accept
  new key prefixes / event types / audit entries, but never a second implementation of
  any of the three.
- **"Frozen" means extend, not redesign.** A future milestone that needs new BI
  capability adds a seventh domain the same way the sixth was added — read every prior
  milestone's own design/completion doc, audit what already exists before writing
  anything new, compose rather than duplicate, run the full regression suite, document
  the reuse audit in its own completion report — not a rewrite of anything this document
  describes.

**This discipline is deliberately explicit because ApnaBill is expected to grow beyond
the BI subsystem into broader ERP capability.** A platform whose contracts are treated
as permanent from the moment they stabilize is one later work can safely build on
without first re-verifying it still behaves as documented — that guarantee is what "The
Bible" in this document's own framing is protecting.

**Before changing anything under `js/services/businessIntelligence/`**, a future
contributor should: read this document in full; read
`docs/architecture/business-intelligence.md`'s relevant domain section(s); read
`docs/architecture/business-intelligence-api.md`'s relevant function contracts; confirm
whether the change is a new domain (extend, per §4) or a change to an existing one
(requires an explicit, disclosed reason a version bump and migration note are
warranted, per §5) — and if in doubt, treat the existing architecture as correct and
ask before redesigning it.

## 14. Architecture Decision Records

Every design choice this document states as a rule (§4's composition patterns, §13's
freeze) was, at the time, a decision someone had to make among real alternatives — and
until now, the only record of *why* has lived inside each milestone's own design doc,
under a "Key design questions answered" section, one milestone at a time. That is
sufficient for a decision scoped to one milestone; it is not durable enough for a
decision, like the freeze this document itself declares, that is meant to outlive any
single milestone and govern every one after it.

`docs/architecture/ADR/` exists for exactly that gap: one short, permanent file per
significant architecture decision, written at the time it is made, never rewritten
afterward (a changed decision gets a new ADR that supersedes the old one — see that
directory's own `README.md` for the format and the "when to write one" criteria). It is
not a replacement for this document, `business-intelligence.md`, or any milestone's own
docs — a domain's *architecture* is documented in `business-intelligence.md`; a
domain's own *design rationale* is documented in its milestone design doc; a decision
that is genuinely load-bearing across multiple future milestones — the kind this
document's own §4 and §13 describe — gets an ADR instead, or in addition.

**No ADRs have been written yet.** The directory exists now so the practice is
established before it is needed; Milestones 12A–12F's own decisions remain adequately
documented where they already are (§4's own citations, each milestone's completion
report). The first ADR this repository writes should be for the next decision that
meets the criteria in `docs/architecture/ADR/README.md` — not a retroactive backfill of
history already recorded elsewhere.
