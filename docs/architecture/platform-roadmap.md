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

## 4. Current Repository Status

| | |
|---|---|
| **Current Branch** | `master` |
| **Latest Release** | `pricing-intelligence-v1.0` |
| **Latest Commit** | `142c963` |
| **Business Intelligence Platform** | Inventory Intelligence ✓ · Purchase Intelligence ✓ · Sales Intelligence ✓ · Pricing Intelligence ✓ |
| **Regression** | 1275 / 1275 passing |
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
