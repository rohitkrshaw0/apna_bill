# Milestone 11D — Background Job Engine: Architecture Design

## 1. Goals

Build a reusable Background Job Engine: infrastructure work that runs *after* a business
operation has already completed, triggered by the Domain Events that operation already
publishes (11B). The ERP stays fully synchronous — jobs are non-blocking, isolated,
non-retrying infrastructure, never business logic. This milestone also does something
11A and 11C deliberately did not: it wires real subscribers into the live application, at
real startup, because the brief explicitly requires it this time (§7).

## 2. Current architecture (as it exists today)

Read in full before any code was written: `docs/milestone-11a-event-bus-design.md`,
`docs/event-bus-architecture.md`, `docs/milestone-11b-event-integration-report.md`,
`docs/milestone-11c-diagnostics-design.md`, `docs/diagnostics-architecture.md`. Three
facts from that reading shaped every decision below:

1. **The Event Bus is synchronous and notification-only** (11A) — `publish()` never
   awaits a subscriber, and a subscriber's own returned promise is only `.catch()`-ed,
   never awaited either. This is *exactly* the non-blocking property a job engine needs,
   already built — no change to `bus/eventBus.js` required or permitted.
2. **11B already publishes real events from real success points** — `PurchaseCreated`,
   `SaleCreated`, `ItemCreated`, `StockAdjusted`, `ManufacturingCompleted`, and others are
   already flowing through the live application. A job engine has real events to react to
   from day one, without this milestone touching a single business file to get them.
3. **11C already built (but never started) an `ALL_EVENTS` observer plus reusable
   diagnostics primitives** — `createStructuredLogger`, `createExecutionTimeline`,
   `createMetricsRecorder`, `deriveTraceContextFromEvent`, `classifyError`/
   `describeError` — and its own architecture doc §12 explicitly named "a future
   Background Jobs milestone" as a consumer of exactly these, independent of the Event
   Bus. This milestone is that consumer.

Application startup, confirmed by reading every page before writing any code: there is
**no shared bootstrap file** anywhere in this repository. Seven pages
(`menu.html`, `purchase.html`, `suppliers.html`, `stock.html`, `items.html`,
`manufacturing.html`, `sale.html`) each independently define their own
`async function boot () { const session = await requireAuth(); if (!session) return; ...
}`, called once via `boot().catch(...)` at the bottom of their own `<script
type="module">`. `index.html` does not call `requireAuth()` (it is the pre-company-selection
page) and was left out of scope — the seven pages that *do* share this identical,
pre-existing pattern are "the application's existing startup mechanism" the brief refers
to.

## 3. Non-goals (explicit, from the brief)

Not built here: the Audit Platform, a Plugin Framework, Cloud Sync, Notifications,
Email, WhatsApp, Scheduled Tasks, Cron Jobs, or a Monitoring Dashboard. Not modified
here: any ERP workflow, the database schema, business rules, validation, Shared
Services, Event Bus internals (`publish()`/subscriber execution unchanged), or
Diagnostics' own logic (only new *instances* of its reusable factories are created —
see §8).

## 4. Key design questions answered

**Where does this platform live?** `js/services/jobs/`, a sibling of `events/`,
`diagnostics/`, and `dataExchange/`. Its only dependencies are `events/` and
`diagnostics/`'s public barrels — confirmed by grep: nothing under `jobs/` imports from
`dataExchange/` or any business file except the one, deliberate reverse direction this
milestone specifically requires (§7): seven page files import
`startBackgroundInfrastructure` from `jobs/`.

**Registry: static data table or runtime construct?** Runtime (`createJobRegistry()`).
`events/registry/eventTypes.js` is static data because an event type carries no
executable code; a **job** definition inherently bundles a real handler function, so
"central registry of every background job" is necessarily a small stateful service
(matching every other factory-function service in this codebase), not a plain constant
object. The "avoid string literals" guarantee is preserved identically: `JOB_IDS`
(`registry/jobIds.js`) is the one place job id strings are written down, and
`register()` throws for any id not in that catalog — exactly the same enforcement
`eventBus.publish()`/`subscribe()` already apply to event types.

**Job Context: a new context system, or reuse?** Reuse, completely — see §6. There is no
`jobContext.js` file anywhere in this platform.

**Diagnostics integration: wrap, extend, or instantiate?** Instantiate. The dispatcher
constructs its **own instances** of `createStructuredLogger()`/`createExecutionTimeline()`/
`createMetricsRecorder()` — the same pattern `diagnostics/observer/eventObserver.js`
itself already uses for its own instrumentation (11C). This is the intended reuse path
these factories were built for (each returns an independent instance,
by design), not duplication — no diagnostics *logic* is reimplemented anywhere in
`jobs/`.

**Why does this milestone wire real call sites, when 11A and 11C deliberately did not?**
Because the brief says so explicitly ("Register infrastructure subscribers during
application initialization using the application's existing startup mechanism") and
gives a concrete, non-negotiable constraint on *how*: no new bootstrap framework, no
parallel initialization system — use the *existing* one. §7 is the resulting design.

## 5. Design principles

1. **The ERP always completes first.** Every job's trigger is a Domain Event, which by
   11B's own publishing rule only exists once its business operation already succeeded.
   No file under `jobs/` can call back into business code — there is no such export
   anywhere in this platform.
2. **One execution pipeline, no exceptions.** `dispatcher/jobDispatcher.js`'s
   `executeJob()` is the only place any job's `.handler(...)` is ever called — confirmed
   by grep, not just by policy (same verification style 11C used for
   "never calls `eventBus.publish`").
3. **Self-protecting, isolated, non-retrying.** A job failure is caught, classified,
   logged, and recorded — never rethrown, never retried, never allowed to affect a
   sibling job, another Event Bus subscriber, or the publishing business code.
4. **Reuse, never duplicate.** Job Context is Trace Context. Diagnostics integration is
   new instances of existing factories. No second logging/timing/classification system
   exists anywhere in this platform.
5. **Minimal, honest wiring.** Exactly one line added to each of seven pre-existing
   `boot()` functions — no new file, page, or mechanism introduced to carry it.

## 6. Job Context — reused, not duplicated

The brief lists seven Job Context fields: `traceId`, `requestId`, `executionId`,
`correlationId`, `company`, `user`, `module`. These are (at most, ignoring `source`,
which Job Context simply doesn't need to mention explicitly since it's still available)
**exactly** `diagnostics/trace/traceContext.js`'s own `TraceContext` shape, built in
11C specifically so a future consumer wouldn't need its own context system.
`dispatcher/jobDispatcher.js` calls `deriveTraceContextFromEvent(event)` — the identical
function 11C's own observer calls — to build each `JobInput`'s `context` field. There is
no `jobContext.js`, no second whitelist, and no re-implementation anywhere in this
platform; "do not duplicate context systems" is satisfied by having zero lines of new
context code at all.

## 7. Application startup integration

Every one of the seven pages already has this exact shape:

```js
async function boot () {
  const session = await requireAuth();
  if (!session) return;
  // ... page-specific setup ...
}
boot().catch(err => console.error(err));
```

This milestone adds exactly two lines to each: one import
(`import { startBackgroundInfrastructure } from './js/services/jobs/index.js';`) and one
call (`startBackgroundInfrastructure();`), placed immediately after
`if (!session) return;` — i.e. only once a session is confirmed, before any
page-specific setup runs, and never awaited (it is synchronous — see §9 — so it adds no
delay to the rest of `boot()`). No new file, no shared init module, no change to
`requireAuth()` itself (a Shared Service — this milestone's own strict rules forbid
modifying it) or to any other part of any page's markup, styling, or business logic.

`index.html` was deliberately left out — it does not call `requireAuth()` and represents
a different part of the app lifecycle (pre-company-selection) than the six business
module pages plus the app shell (`menu.html`) this milestone targets.

**Why per-page, not once globally?** ApnaBill is a classic multi-page application — each
navigation is a full page load, and `events/index.js`'s `eventBus` singleton (like every
other module-level singleton in this codebase) is re-created fresh on every page load.
A job dispatcher subscription therefore cannot persist across navigations; it must be
re-established on each page that might publish a trigger event, which is exactly what
adding the call to all seven pages achieves.

## 8. Diagnostics integration (detail)

`createJobDispatcher()` accepts optional `logger`/`timeline`/`metrics`, defaulting to
fresh instances of `diagnostics/`'s own factories, scoped to this one dispatcher. Per job
execution:

- `timeline.start('job:<jobId>', {...})` / `timeline.finish(...)` — one `TimelineEntry`
  per execution, success/failure/duration.
- `logger.withTrace(context).debug/info/error(...)` — structured log lines at start,
  completion, and failure.
- `metrics.recordEvent({ type: jobId }, { handlerDurationMs, dispatchLatencyMs: 0 })` —
  reuses `MetricsRecorder`'s existing count/avg/min/max aggregation, bucketed by job id
  instead of event type (that function only ever reads `.type` off whatever is passed to
  it — passing a job id there, not a `DomainEvent`, is a deliberate, minimal reuse, not a
  misuse; `dispatchLatencyMs` is fixed at `0` here since it measures event-to-subscriber
  delay, a concept that belongs to the *event's* dispatch, not a job's own execution
  time).

None of this duplicates diagnostics' own aggregation, classification, or logging code —
it is instantiation and direct function calls only.

## 9. Job Dispatcher — the single execution pipeline

```
eventBus.subscribe(triggerEventType, async (event) => { executeJob(definition, event); })
                                                              │
                                                              ▼
                                          executeJob(): self-protected, single pipeline
                                            ├─ createJobRun() -> toRunning()
                                            ├─ context = deriveTraceContextFromEvent(event)
                                            ├─ await definition.handler({ event, context })
                                            ├─ success -> toCompleted(run, output)
                                            └─ failure -> toFailed(run, error)   [never rethrown]
                                          recordRun(run)   -- bounded ring buffer, 500 entries
```

`registerJob()` only adds to the registry; subscribing to the Event Bus happens once
`start()` runs (or immediately, if a job is registered after the dispatcher is already
running — see `dispatcher/jobDispatcher.js`'s own `registerJob()`). `start()`/`stop()`
are idempotent, matching `diagnostics/observer/eventObserver.js`'s own convention
exactly. Every subscribe callback is `async` — the Event Bus never awaits it (11A), which
is what makes job execution genuinely non-blocking relative to the business code that
published the triggering event.

## 10. Job Lifecycle

Exactly the five states the brief names — `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`,
`CANCELLED` — no others. Every transition (`toRunning`/`toCompleted`/`toFailed`/
`toCancelled`) returns a **new** frozen `JobRun` snapshot rather than mutating one in
place, the same immutability convention `DomainEvent`/`HistoryEntry` already follow
throughout this codebase. `toCancelled()` is implemented (so the enum value is genuinely
usable, not just declared) but never called by this milestone's dispatcher — "reserved
for future use" per the brief, left ready rather than wired to nothing real.

## 11. Error handling

A job failure: caught inside `executeJob()`, classified via `diagnostics/errors/
errorClassifier.js`'s `describeError()`, logged at `error` level, recorded as a `FAILED`
`JobRun` — and never rethrown anywhere. No retry logic exists in this file or anywhere
else in `jobs/` — confirmed by grep for `retry`/`attempt` returning nothing beyond this
design doc's own prose. A failing job never re-runs the business operation that
triggered it (there is no code path from a job back into business logic at all, §5) and
never affects a sibling job, another Event Bus subscriber, or the publishing code's own
control flow.

## 12. Initial (demonstration) jobs

Three, matching the brief's own examples exactly, each intentionally scoped to one
representative slice of the real 11B event catalog rather than every event type:

- **`writeDiagnosticEntry`** — `ItemCreated`/`CustomerCreated`/`SupplierCreated`. Writes
  one structured log line via a `diagnostics` logger. No DB write, no UI.
- **`refreshMetrics`** — `PurchaseCreated`/`SaleCreated`. Maintains an in-memory
  per-aggregate tally, refreshed on every trigger. No DB write, no UI, no persistence
  (persistence is Audit's job, explicitly out of scope here).
- **`updateExecutionCounters`** — `StockAdjusted`/`ManufacturingCompleted`. Increments an
  in-memory counter. No DB write, no UI.

All three are demonstrably passive: their `JobOutput.result` never contains anything
resembling a Supabase call, a DOM mutation, or business state — verified directly in the
test suite (§ report doc "New test coverage").

## 13. Risks

- **A future job author is tempted to call another job's handler directly "just this
  once."** Mitigated by there being no exported way to do so — the only path to
  execution is publishing the job's own trigger event through the real Event Bus.
- **A future job author adds retry logic inside their own handler**, working around this
  milestone's "no automatic retry" rule from the inside. Mitigated by this document and
  the dispatcher's own header comment stating the rule plainly; a genuine retry policy is
  explicitly out of scope for the whole platform, not just this dispatcher.
- **Someone assumes `metrics.recordEvent({ type: jobId }, ...)` is measuring the same
  thing `diagnostics/metrics/metricsRecorder.js` measures for observed Domain Events.**
  Mitigated by §8's explicit disclosure of this deliberate, minimal reuse.

## 14. Alternatives considered

- **A static `JOB_DEFINITIONS` table (data only), with handlers looked up by id from a
  separate map.** Rejected — splits one logical unit (a job) across two files for no
  benefit; `createJobDefinition()` already keeps metadata and handler as one frozen,
  validated object, and `JOB_IDS` alone (not a second table) is what "avoid string
  literals" actually requires.
- **Give `jobDispatcher.js` its own copy of a logger/timer/metrics aggregator.**
  Rejected outright by the brief ("do not duplicate diagnostics logic") and by this
  design's own principle 4.
- **A new shared `js/bootstrap.js` imported by every page instead of touching seven
  files individually.** Rejected — the brief explicitly forbids "a new bootstrap
  framework" or "a parallel initialization system"; the seven pages' own duplicated
  `boot()` pattern is already how this application does startup, and matching it (rather
  than replacing it) is what "use the current application startup flow" means.
- **Await job execution from inside the Event Bus's `publish()` somehow, so a caller
  could know jobs finished.** Rejected — would require modifying `bus/eventBus.js`
  (forbidden) and would make job execution *blocking*, the opposite of this milestone's
  entire purpose.

## 15. Final recommendation

Build exactly the module described in §6–§12, wire it into the seven real pages exactly
as §7 describes, and hand the finished, tested, documented engine to whichever milestone
subscribes to it next (the Audit Platform, a Plugin Framework, or any future job author)
— `docs/job-engine-architecture.md` §11 gives them enough to register a new job without
touching this engine's own files.
