# Diagnostics & Observability Platform — Architecture Reference

This is the permanent architectural reference for `js/services/diagnostics/`, written for
whoever maintains or extends this module next. It describes the system **as it stands
today**, organized by concept, not by milestone. It does not repeat the rationale already
recorded in the milestone docs — consult those when you need the "why" behind a specific
decision:

- `docs/milestone-11c-diagnostics-design.md` — full design rationale, alternatives
  considered, what this platform structurally cannot measure and why
- `docs/milestone-11c-diagnostics-report.md` — what was actually built and verified

## 1. What this platform is

The Diagnostics & Observability Platform is ApnaBill's passive observation layer:
structured logging, a trace context, execution timing, error classification, performance
metrics, and diagnostic report building. It **observes** the Domain Event Bus (11A/11B);
it never controls, retries, corrects, or influences anything. It is **not** an audit log,
not a background job system, not a dashboard, and not a plugin framework — those are
11D and beyond, each a separate consumer of this platform or of the Event Bus directly.

It lives entirely under `js/services/diagnostics/`, is a sibling of
`js/services/events/` and `js/services/dataExchange/` (not nested inside either), and
depends on exactly one thing outside itself: `events/`'s public barrel. As of this
writing it has **zero live call sites** — importing it has no effect until some future
caller explicitly starts it (§7).

## 2. Module map and dependency direction

```
shared/                    <- no internal deps (self-contained; deliberately not
  freezeDeep.js, generateId.js, now.js   imported from events/shared/ or dataExchange/shared/)
  ↑
logging/                    <- shared/
  logLevels.js, structuredLogger.js, consoleSink.js, memorySink.js
  ↑
errors/                     <- shared/freezeDeep
  errorClassifier.js
  ↑
trace/                      <- shared/generateId
  traceContext.js
  ↑
timeline/                   <- shared/now, errors/ (for describeError on failure)
  executionTimeline.js
  ↑
metrics/                    <- shared/freezeDeep
  metricsRecorder.js
  ↑
observer/                   <- events/ (eventBus, ALL_EVENTS), logging/, trace/, errors/,
  eventObserver.js             timeline/, metrics/  -- the only file that imports events/
  ↑
reports/                    <- shared/freezeDeep
  diagnosticReportBuilder.js  (takes a metrics/timeline instance as input; no import of either)
  ↑
index.js                    <- re-exports everything above; constructs (does not start)
                                `diagnosticsObserver`
```

`observer/eventObserver.js` is the only file in this platform that imports from
`events/`. Every other file is independently usable and independently testable —
`createStructuredLogger()`, `createExecutionTimeline()`, `createMetricsRecorder()`, and
`classifyError()` all work with zero Event Bus involvement, useful to a future
Background Jobs milestone that has nothing to do with events at all.

## 3. Public API (`js/services/diagnostics/index.js`)

```js
import { diagnosticsObserver, createEventObserver, createStructuredLogger, createTraceContext, classifyError, createDiagnosticReport } from '<path>/services/diagnostics/index.js';
```

| Export | Kind | Purpose |
|---|---|---|
| `diagnosticsObserver` | instance | Bound to the shared `eventBus`. Constructed, **not started** — call `.start()` to begin observing. |
| `createEventObserver({ eventBus?, logger?, timeline?, metrics? })` | factory | An isolated observer — for tests, or a deliberately separate instance. |
| `createStructuredLogger({ name?, sink?, minLevel? })` | factory | The structured logger (§4). |
| `createConsoleSink()` / `createMemorySink()` | factories | Pluggable sinks for the structured logger. |
| `LOG_LEVELS` / `LOG_LEVEL_PRIORITY` | constants | `debug`/`info`/`warn`/`error` and their filter priority. |
| `createTraceContext(overrides?)` / `deriveTraceContextFromEvent(event)` | functions | Trace context construction (§5). |
| `ERROR_CATEGORIES` / `classifyError(error)` / `describeError(error)` | constants/functions | The five-category error model (§6). |
| `createExecutionTimeline({ maxEntries? })` | factory | General-purpose start/finish/`time()` timing (§7). |
| `createMetricsRecorder()` | factory | Event count + duration/latency aggregates (§7). |
| `createDiagnosticReport({ metrics?, timeline?, startedAt?, recentTimelineLimit? })` | function | A structured, frozen snapshot for future tooling (§8). |

### `diagnosticsObserver`'s methods

```js
diagnosticsObserver.start();       // -> true, or false if already running (idempotent)
diagnosticsObserver.stop();        // -> true, or false if already stopped (idempotent)
diagnosticsObserver.isRunning();   // -> boolean
diagnosticsObserver.timeline;      // this observer's own ExecutionTimeline instance
diagnosticsObserver.metrics;       // this observer's own MetricsRecorder instance
diagnosticsObserver.logger;        // this observer's own StructuredLogger instance
```

## 4. Structured logging

Every log entry is one `LogEntry` object, never a free-form string:

```
level        one of LOG_LEVELS (debug/info/warn/error)
name         which subsystem logged this (the logger's own `name`)
message      string
timestamp    ISO-8601
trace        whatever TraceContext fields were supplied, or {}
meta         caller-supplied structured detail, or {}
```

`minLevel` (default `LOG_LEVELS.INFO`) is the platform's "environment-awareness"
mechanism — there is no `process.env` in this browser codebase, so a caller (or a future
environment-specific bootstrap) sets `minLevel` directly: low (`DEBUG`) in development,
high (`WARN`) in production. `logger.withTrace(trace)` returns a bound logger whose four
methods no longer need `{ trace }` passed at every call site.

## 5. Trace context

Eight optional fields: `traceId`, `requestId`, `executionId`, `correlationId`, `company`,
`module`, `user`, `source`. Seven are the exact same whitelist
`events/context/eventContext.js` already uses (reused, not duplicated); `correlationId`
is the one field diagnostics adds on its own — a bookkeeping identifier for correlating
several observations, auto-generated (`crypto.randomUUID()`-based) only when not
supplied. `deriveTraceContextFromEvent(event)` builds a `TraceContext` from an
already-published `DomainEvent`'s own `metadata` — nothing is fabricated; a field absent
from the event stays absent from the derived trace.

## 6. Error classification

Five categories (`ERROR_CATEGORIES.VALIDATION` / `BUSINESS` / `INFRASTRUCTURE` /
`NETWORK` / `UNEXPECTED`). `classifyError(error)` never throws for any input. A
dataExchange-shaped error (has a `.category` string matching that platform's own known
category values) maps onto the closest one of these five; a network-hinting
message/name/code classifies `NETWORK`; a bare `TypeError`/`RangeError`/`ReferenceError`
with no other hint classifies `UNEXPECTED`; everything else defaults to `UNEXPECTED`
rather than guessing. `describeError(error)` produces a small, JSON-safe, immutable
summary (`{ message, category, code, name }`) safe to log or store.

## 7. Execution timeline and performance metrics

`createExecutionTimeline({ maxEntries = 500 })` is general-purpose — any code can call
`start()`/`finish()` or the `time(label, fn, meta)` convenience wrapper to time any
operation, sync or async. `time()` never swallows, retries, or corrects an outcome: the
wrapped function's return value or thrown/rejected error passes through completely
unchanged; only a `TimelineEntry` (label/startedAt/finishedAt/durationMs/success/
error/meta) is recorded as a side effect. The buffer is capped — oldest entries drop
first.

`createMetricsRecorder()` aggregates `totalEventsObserved`, `eventCountByType`, and two
duration statistics (count/avg/min/max): `handlerDuration` and `dispatchLatency`.
**Important limitation**: both of these describe **this observer's own** processing —
the Event Bus does not expose one subscriber's duration to another (11A's `dispatch()` is
private per-subscriber), so diagnostics cannot and does not claim to measure any other
subscriber's latency. `dispatchLatency` is the time between an event's own `timestamp`
(stamped inside `publish()`) and the moment this observer received it — near-zero on a
synchronous bus, but a real, measured value.

## 8. Diagnostic reports

`createDiagnosticReport({ metrics, timeline, startedAt?, recentTimelineLimit? })` is a
pure function producing one frozen, structured snapshot:

```
generatedAt          ISO-8601, when this report was built
uptimeMs              null if startedAt not supplied, else elapsed ms
metrics                metrics.snapshot(), or null if metrics not supplied
recentTimeline         the most recent `recentTimelineLimit` (default 50) timeline entries
timelineEntryCount     total entries currently in the timeline buffer
```

No UI, no I/O, no side effects — a future Diagnostics Dashboard or the Audit Platform
calls this periodically and renders/persists its output; nothing about this function
needs to change to support that.

## 9. Event observation and self-protection

`observer/eventObserver.js`'s `createEventObserver()` is the one place in this platform
that touches the Event Bus — a single `eventBus.subscribe(ALL_EVENTS, onEvent)` call made
by `start()`, undone by `stop()` (both idempotent). `onEvent()` is wrapped in its own
`try/catch`: a bug in this observer's own processing is caught, classified, logged via
this observer's own logger, and never reaches the Event Bus's dispatch loop or a sibling
subscriber — redundant with the bus's own per-subscriber isolation by design (a
"production safe" platform should not rely solely on its host's safety net). This file
contains no reference to `eventBus.publish` anywhere.

## 10. Current call sites

**None.** `diagnosticsObserver` (exported from `index.js`) is constructed but not
started by this milestone — see design doc §8 for why this is deliberate, not
incomplete. Milestone 11D (Background Job Engine) deliberately did NOT start it either —
it reused `diagnostics/`'s reusable factories (logger/timeline/metrics) by constructing
its own fresh instances, not by starting this shared observer (see
`docs/job-engine-architecture.md` §8). The first real caller of `.start()` will be
whichever future milestone wants live, whole-application event observation running (the
Audit Platform is the most likely candidate).

## 11. How to extend this platform

**Add a new diagnostics capability**: add a new file under `diagnostics/`, export it from
`index.js`. Nothing about the Event Bus or any existing diagnostics file needs to change.

**Consume this platform from a future milestone**: import `createEventObserver` (for an
isolated instance) or the shared `diagnosticsObserver`, call `.start()`, read
`.metrics`/`.timeline`/`.logger` directly, or periodically call `createDiagnosticReport()`
for a structured snapshot.

**Add a new subscriber that needs to see every event** (the Audit Platform, a future
Plugin Framework): subscribe to `events/`'s `ALL_EVENTS` directly, the same way this platform's
own observer does — do not route through diagnostics itself; diagnostics is one
subscriber among peers, not a hub other subscribers register through.

## 12. Future milestones

- **11D Background Job Engine** — done. `js/services/jobs/` reuses
  `createExecutionTimeline()`/`createMetricsRecorder()`/`createStructuredLogger()`/
  `deriveTraceContextFromEvent()` directly, independent of `diagnosticsObserver` (which
  it left unstarted) — see `docs/job-engine-architecture.md` §8.
- **The Audit Platform** — the natural next `ALL_EVENTS` subscriber; likely persists
  `describeError()`/`deriveTraceContextFromEvent()`-shaped records. This platform's
  `createMemorySink()` pattern is the template for an eventual audit sink.
- **A future Plugin Framework** — plugins use `createStructuredLogger()`/
  `createExecutionTimeline()` like any first-party module; no diagnostics-specific plugin
  API needed.
- **A future Diagnostics Dashboard** — calls `createDiagnosticReport()` periodically and
  renders it; no change to this platform required.
- **Starting `diagnosticsObserver` for real** — the one piece of wiring this milestone
  deliberately left undone (§10).
