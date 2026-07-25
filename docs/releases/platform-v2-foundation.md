# Platform v2 Foundation

**As of tag:** `extension-framework-v1.0` · **Commit:** `9cc46cc` (`master`) · **Date:**
2026-07-26

This is **not** a new release checkpoint tied to a new tag — no code changed to produce
this document. It is a cross-cutting synthesis, written the moment the approved
infrastructure roadmap (`docs/architecture/platform-roadmap.md`) closed, marking the point
where ApnaBill stops being "a sequence of infrastructure milestones" and becomes a
**complete, stable foundation** that future feature work — "v2" — builds on top of. Every
fact in this document is already recorded somewhere else (`platform-roadmap.md`, the six
per-checkpoint release docs, each platform's own architecture reference); this document's
only job is to say, in one place, "the foundation is complete, here is exactly what it
consists of, and here is what building on it does and doesn't require."

## Why this document exists

Six checkpoints landed in sequence: `json-platform-v1.0` → `event-integration-v1.0` /
`diagnostics-core-v1.0` (both folded into) → `infrastructure-platform-v1.0` →
`audit-platform-v1.0` → `extension-framework-v1.0`. Each one's own release doc is
necessarily scoped to *that* milestone. None of them, individually, answer the question a
v2 feature author actually has: *"is the foundation done, and what exactly is in it?"*
This document answers that question once, so nobody has to reconstruct the answer by
reading six release docs and five architecture references in sequence.

## The foundation, as it stands today

```
Core ERP Platform
  ↓
Data Exchange Platform
  ↓
Infrastructure Platform
    ├── Domain Event Bus              (11A)
    ├── Domain Event Integration      (11B)
    ├── Diagnostics & Observability   (11C)
    ├── Background Job Engine         (11D)
    ├── Audit Platform                (11E)
    └── Plugin & Extension Framework  (11F)
```

**Core ERP Platform** — Company/Firm management, Customers, Suppliers, Items, Purchases,
Sales, Manufacturing, Stock, Dashboard, Reports. Database schema frozen, business logic
stable, unmodified by any infrastructure milestone (11A–11F all confirmed this by grep at
their own checkpoint, every time).

**Data Exchange Platform** — Tally-dialect XML import/export, native `.apnabill`
backup/restore, canonical JSON import/export, one shared Migration Engine underneath all
three. Untouched by 11A–11F except for the fourteen `eventBus.publish()` call sites 11B
added at existing success points (zero behavior change — see
`docs/releases/event-integration-v1.0.md`).

**Infrastructure Platform** — six sibling capabilities, each independently useful, each
consuming only what it needs from the others, none of them modifying an existing one:

| Platform | What it does | Live in production? |
|---|---|---|
| Domain Event Bus (11A) | Synchronous, in-process publish/subscribe; the single source of truth for business event types | Yes — the substrate everything else runs on |
| Domain Event Integration (11B) | 12 of 15 registered event types published from their real ERP/Data-Exchange success points | Yes |
| Diagnostics & Observability (11C) | Structured logging, trace context, error classification, execution timing, performance metrics | Built, `diagnosticsObserver` never started |
| Background Job Engine (11D) | Non-blocking infrastructure work triggered by Domain Events, 3 demonstration jobs | Yes — wired into 7 real pages' own startup flow |
| Audit Platform (11E) | Immutable, append-only business history, one record per observed event | Built, `auditSubscriber` never started |
| Plugin & Extension Framework (11F) | Generic extension lifecycle + a controlled context over all of the above | Built, `extensionRuntime` has zero registered extensions |

Three of six are "built but dormant" (Diagnostics, Audit, the Extension Framework itself
have nothing live running against them) — this is intentional, disclosed, repeated
architecture in every relevant milestone's own docs, not a gap: 11A and 11C's own briefs
never asked for live wiring; 11D's brief did, explicitly, and only 11D got it.

## Complete checkpoint history

| Tag | Milestone(s) | Represents |
|---|---|---|
| `migration-engine-v1.0` | 9F | The shared Migration Engine underneath every Data Exchange direction |
| `json-platform-v1.0` | 10 | Canonical JSON established alongside Tally XML |
| `infrastructure-platform-v1.0` | 11A–11D | Event Bus, Event Integration, Diagnostics, Job Engine, as one consolidated checkpoint (11A/11B's own detail: `event-integration-v1.0.md`; 11C's own detail: `diagnostics-core-v1.0.md`) |
| `audit-platform-v1.0` | 11E | The Audit Platform |
| `extension-framework-v1.0` | 11F | The Plugin & Extension Framework — closes the roadmap |

Full verification detail (regression figures, exact files changed, known limitations) for
each lives in its own record under `docs/releases/`. This document does not repeat any of
it.

## What "v2" means

Per `platform-roadmap.md` §6 (unchanged by this document): **the approved infrastructure
roadmap is complete. No further infrastructure milestone is currently approved.** "v2"
is not a planned milestone — it is the label for whatever comes next, and by
construction, none of it requires touching `js/services/events/`, `js/services/diagnostics/`,
`js/services/jobs/`, `js/services/audit/`, or `js/services/extensions/`'s own internals.
Concretely, v2 work is expected to be one or more of:

- **A real extension**, built with `createExtensionDefinition()` +
  `extensionRuntime.register()`, consuming the Event Bus, Diagnostics, Audit queries, and
  Job Dispatcher observation through its own `ExtensionContext` — see
  `docs/extension-framework-architecture.md` §12.
- **Starting a dormant subscriber for real** — `diagnosticsObserver.start()` and/or
  `auditSubscriber.start()`, from wherever a future bootstrap decides is appropriate
  (the same pattern 11D already used for `startBackgroundInfrastructure()`).
- **Real persistence for Audit** — a database-backed `IAuditStore` implementation, which
  *would* require a schema change, but not a change to `audit/subscriber/` or
  `audit/query/` (the abstraction exists specifically for this).
- **Wiring the three still-unwired 11B event types** (`PurchaseDeleted`, `SaleCancelled`,
  `ManufacturingStarted`) if and when a real delete-purchase/cancel-sale/multi-phase-
  manufacturing implementation is ever built in the ERP itself.
- **A genuinely new architectural phase** — possible, but per `platform-roadmap.md` §9's
  own permanent rule, that would be a new, separately-approved decision, not an extension
  of the 11A–11F roadmap this document closes out.

## What is stable vs. what is disclosed, open technical debt

**Stable, frozen, confirmed unmodified across all six infrastructure milestones:**
database schema, ERP business logic, UI, the Event Bus's `publish()`/`subscribe()`
semantics, Diagnostics' own logic, the Job Engine's dispatch pipeline, the Audit
Platform's record contract.

**Disclosed, open items** (consolidated from every checkpoint's own "Known
Limitations"/"Technical Debt" — none are blockers, all were flagged at the milestone that
found them, not discovered late):

- No Core ERP file has an automated test harness (`purchases.js`, `sales.js`, etc.) —
  their `eventBus.publish()` call sites were verified by code review, not a suite (11B).
- Event payloads have no formal, validated schema — informally shaped per type (11B).
- The Audit Store's one reference implementation is in-memory and unbounded by design
  (capping it would violate "never deleted") — real persistence is a future schema
  change (11E).
- The Job Engine and Audit Platform's in-memory state (run history, audit records) is
  lost on every page navigation, same as every other in-memory platform state in this
  multi-page application (11D, 11E).
- Extensions get read-only Job Dispatcher observation, not job registration —
  `jobs/registry/jobIds.js`'s closed catalog would need a deliberate future redesign
  first (11F).
- Cross-subscriber failure visibility (one Event Bus subscriber seeing another's error)
  would require a future, opt-in Event Bus enhancement — not attempted, the bus is
  frozen (11C).
- Same longstanding Data Exchange items from `json-platform-v1.0`: Purchase/
  Manufacturing/Stock/Settings entity coverage for JSON/XML, CSV/Excel import/export,
  Cloud Backup/Sync, promoting `apnabill/zip/crc32.js` to `shared/`.

## Where to start

`docs/architecture/platform-roadmap.md` §10's own reading order is unchanged by this
document and remains authoritative: read the roadmap first, then the latest release
checkpoint (this document, informally, sits alongside `extension-framework-v1.0.md` as
the latest), then the latest milestone report, then the relevant platform architecture
document, then implementation, then source.

## Recommendation

The foundation is complete: five infrastructure platforms, one shared Event Bus
substrate, zero unresolved architectural tension left unstated, 882/882 regression
passing at `extension-framework-v1.0`. **Nothing further is required before starting v2
feature work.** This document does not authorize, plan, or speculate about what v2
contains beyond what is already listed above as illustrative examples — that remains a
decision for whoever starts it.
