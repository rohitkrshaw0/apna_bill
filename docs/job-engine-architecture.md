# Background Job Engine — Architecture Reference

This is the permanent architectural reference for `js/services/jobs/`, written for
whoever maintains or extends this module next. It describes the system **as it stands
today**, organized by concept, not by milestone. It does not repeat the rationale already
recorded in the milestone docs — consult those when you need the "why" behind a specific
decision:

- `docs/milestone-11d-job-engine-design.md` — full design rationale, alternatives
  considered, startup-integration reasoning
- `docs/milestone-11d-job-engine-report.md` — what was actually built and verified

## 1. What this platform is

The Background Job Engine is ApnaBill's infrastructure for running non-blocking work
*after* a business operation has already completed, triggered by the Domain Events that
operation publishes (11B). It is **not** business logic, cannot initiate a business
operation, and is not a queue, scheduler, or cron system — jobs run synchronously with
respect to the Event Bus's dispatch (11A), just never awaited by whatever published the
triggering event, which is what makes them "non-blocking."

It lives entirely under `js/services/jobs/`, is a sibling of `js/services/events/` and
`js/services/diagnostics/`, and depends on exactly those two platforms' public barrels —
nothing from `dataExchange/` or any business file. As of this writing it **is** live in
the real application (unlike Diagnostics' own observer, still unstarted) — see §7.

## 2. Module map and dependency direction

```
shared/                    <- no internal deps
  freezeDeep.js, generateId.js, now.js
  ↑
contracts/                  <- shared/freezeDeep
  jobContract.js
  ↑
lifecycle/                  <- shared/, diagnostics/errors (describeError on failure)
  jobLifecycle.js
  ↑
registry/                   <- shared/freezeDeep, contracts/
  jobIds.js, jobRegistry.js
  ↑
dispatcher/                 <- events/ (eventBus), diagnostics/ (logger/timeline/metrics/
  jobDispatcher.js             trace), registry/, lifecycle/  -- the only file that
                                imports from events/
  ↑
jobs/                        <- events/ (EVENT_TYPES), diagnostics/ (logger),
  writeDiagnosticEntryJob.js     registry/jobIds, contracts/  -- the demonstration jobs
  refreshMetricsJob.js
  updateExecutionCountersJob.js
  ↑
bootstrap/                   <- dispatcher/, jobs/  -- owns the shared `jobDispatcher`
  startBackgroundInfrastructure.js
  ↑
index.js                     <- re-exports everything above (via bootstrap/, to avoid
                                 a circular import -- see that file's own header comment)
```

`dispatcher/jobDispatcher.js` is the only file that imports from `events/`. Every job
handler file imports `EVENT_TYPES` (data only, not the bus itself) to declare its
`triggerEvents` — no job file ever calls `eventBus.subscribe`/`publish` directly; only
the dispatcher does.

## 3. Public API (`js/services/jobs/index.js`)

```js
import { jobDispatcher, startBackgroundInfrastructure, JOB_IDS, JOB_STATUS, createJobDispatcher } from '<path>/services/jobs/index.js';
```

| Export | Kind | Purpose |
|---|---|---|
| `jobDispatcher` | instance | The one shared, application-wide dispatcher (re-exported from `bootstrap/`). |
| `startBackgroundInfrastructure()` | function | Registers the 3 real jobs and starts `jobDispatcher`. Idempotent. The one function real pages call. |
| `createJobDispatcher({ eventBus?, registry?, logger?, timeline?, metrics? })` | factory | An isolated dispatcher — for tests, or a deliberately separate instance. |
| `JOB_IDS` | constant map | The one place job id strings are written down. |
| `createJobRegistry()` | factory | An isolated registry (the dispatcher builds its own by default). |
| `createJobDefinition(fields)` / `assertValidJobDefinition(def)` / `createJobOutput(fields)` | functions | Contract construction/validation (§4). |
| `JOB_STATUS` | constant map | The 5 lifecycle states (§5). |
| `createJobRun(fields)` / `toRunning` / `toCompleted` / `toFailed` / `toCancelled` | functions | Immutable lifecycle transitions (§5). |

### `jobDispatcher`'s methods

```js
jobDispatcher.registerJob(definition);      // add to registry; auto-subscribes if already running
jobDispatcher.start();                       // -> true, or false if already running (idempotent)
jobDispatcher.stop();                        // -> true, or false if already stopped (idempotent)
jobDispatcher.isRunning();                   // -> boolean
jobDispatcher.getRunHistory();               // -> JobRun[] (bounded, 500 entries, most recent last)
jobDispatcher.registry / .timeline / .metrics / .logger;   // this dispatcher's own instances
```

## 4. Job contracts

```
JobDefinition   { id, name, version, description, triggerEvents: string[], handler }
JobInput        { event: DomainEvent, context: TraceContext }
JobOutput       { success: boolean, result: *, message: string|null }
```

`id` must be one of `JOB_IDS`. `triggerEvents` are `events/`'s own `EVENT_TYPES` values.
`handler` is `(input: JobInput) => JobOutput | Promise<JobOutput>` and must never import
from `js/ui/`. `createJobOutput()` is the sanctioned way to build a `JobOutput` — small
and structured, never the whole application state (design doc §12).

## 5. Job lifecycle

Exactly five states, no others: `PENDING → RUNNING → (COMPLETED | FAILED)`. `CANCELLED`
is reserved — `toCancelled()` exists and works, but nothing in this platform calls it.
Every transition returns a **new** frozen `JobRun`, never mutates one in place.

```
JobRun  { jobRunId, jobId, status, triggerEventType, triggerEventId,
          startedAt, finishedAt, durationMs, output, error }
```

## 6. Job context

There is no `jobContext.js` file. Job Context **is**
`diagnostics/trace/traceContext.js`'s `TraceContext`, reused verbatim via
`deriveTraceContextFromEvent(event)` — the same function `diagnostics/observer/
eventObserver.js` calls for its own purposes. A job's `input.context` therefore carries
whatever the publishing business code's `context` option put into the event's metadata
(`company`/`module`/`user`/etc., 11B), plus an auto-generated `correlationId` if none was
supplied.

## 7. Application startup integration

`startBackgroundInfrastructure()` is called from inside seven pages' own pre-existing
`boot()` functions, immediately after `requireAuth()` confirms a session:

| Page | Where |
|---|---|
| `menu.html` | after `if (!session) return;` |
| `purchase.html` | after `if (!session) return;` |
| `suppliers.html` | after `if (!session) return;` |
| `stock.html` | after `if (!session) return;` |
| `items.html` | after `if (!session) return;` |
| `manufacturing.html` | after `if (!session) return;` |
| `sale.html` | after `if (!session) return;` |

No new bootstrap file or shared init module exists — each page's own script calls it
directly, exactly as each page already calls `requireAuth()` itself. `index.html` is
outside this pattern (no `requireAuth()` call) and is not wired. Because this is a
multi-page application (fresh module state on every navigation, not a SPA), each page
that might publish or need to observe a trigger event re-establishes the subscription
itself on load — there is no way to "start it once" globally.

## 8. Diagnostics integration

`createJobDispatcher()`'s default `logger`/`timeline`/`metrics` are fresh instances of
`diagnostics/`'s own `createStructuredLogger()`/`createExecutionTimeline()`/
`createMetricsRecorder()` — new instances, zero duplicated logic. Per job execution: one
`TimelineEntry` (`job:<jobId>`, success/failure/duration), structured log lines at
start/completion/failure (bound to the job's derived `TraceContext`), and one metrics
sample bucketed by job id (via `metrics.recordEvent({ type: jobId }, {...})` — that
function only ever reads `.type`, so passing a job id instead of a `DomainEvent` is a
deliberate, minimal reuse of its existing aggregation, not a new concept).

## 9. Error handling and failure isolation

A job failure is caught inside `dispatcher/jobDispatcher.js`'s `executeJob()`, classified
via `diagnostics/errors/errorClassifier.js`, logged, and recorded as a `FAILED` `JobRun`
— and **never rethrown**. No retry logic exists anywhere in this platform. A failing job
never affects: the Event Bus's dispatch loop, a sibling job on the same trigger event,
another (non-job) Event Bus subscriber, or the business code that published the
triggering event.

## 10. Current call sites

Live, as of Milestone 11D — see §7's table. The shared `jobDispatcher` is running with
three registered jobs (`writeDiagnosticEntry`, `refreshMetrics`,
`updateExecutionCounters`) on every one of those seven pages, once a session is
confirmed.

## 11. How to extend this platform

**Register a new job** (from the Audit Platform, a Plugin Framework, or any future
milestone): add its id to `registry/jobIds.js`'s `JOB_IDS`, define it with
`createJobDefinition({...})`, and call `jobDispatcher.registerJob(definition)` from
wherever that milestone's own bootstrap runs (or add it to
`bootstrap/startBackgroundInfrastructure.js` if it should run everywhere the engine
already does). **Nothing about `dispatcher/jobDispatcher.js`,
`lifecycle/jobLifecycle.js`, or `contracts/jobContract.js` needs to change** — this is
the whole point of the registry/dispatcher split.

**Add a job that needs its own diagnostics sink** (e.g. Audit persisting job outcomes):
construct a separate `createJobDispatcher({ logger: createStructuredLogger({ sink:
yourSink }) })` instance rather than modifying this platform's default, OR read
`jobDispatcher.getRunHistory()` directly — it already carries every `JobRun`'s full
outcome.

**A future Plugin Framework's jobs**: register the same way any first-party job does —
`createJobDefinition()` + `jobDispatcher.registerJob()`. No plugin-specific job API is
needed; per-job failure isolation (§9) already protects the rest of the engine from a
misbehaving plugin's job.

## 12. Future milestones

- **The Audit Platform** — the natural next consumer; likely reads
  `jobDispatcher.getRunHistory()` and/or registers its own `ALL_EVENTS`-triggered job (or
  subscribes to the Event Bus directly, the same way Diagnostics' observer does) to
  persist an audit trail. Not built here.
- **A future Plugin Framework** — registers jobs through the same public API any other
  caller uses (§11); no new mechanism needed.
- **A real retry/scheduling policy** — explicitly out of scope for this entire platform,
  not just this milestone; would be a deliberate, separate architectural decision if ever
  pursued.
- **Wiring `index.html`** — if a future page there ever needs to react to a background
  job, the same `startBackgroundInfrastructure()` call can be added there too.
