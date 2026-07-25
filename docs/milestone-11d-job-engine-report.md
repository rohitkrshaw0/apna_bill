# Milestone 11D — Background Job Engine: Report

Deliverables document for the Background Job Engine. Covers what was actually built and
verified; consult `docs/milestone-11d-job-engine-design.md` for the full design rationale
(why each decision was made, alternatives considered, the startup-integration reasoning)
— not repeated here.

## 1. Objective

Build a reusable Background Job Engine — registry, contracts, lifecycle, dispatcher,
reused Job Context, reused Diagnostics integration — and wire it into the real
application's existing startup flow, exactly as the brief required (unlike 11A/11C,
which deliberately built infrastructure without starting it). Three passive demonstration
jobs validate the engine end to end. Zero changes to the Event Bus, Diagnostics logic,
Migration Platform, JSON Platform, database schema, business rules, or validation.

## 2. Architecture implemented

```
page's own boot()                                    (7 real pages, unchanged otherwise)
  │  const session = await requireAuth();
  │  if (!session) return;
  ▼
startBackgroundInfrastructure()                       jobs/bootstrap/, idempotent
  ├─ jobDispatcher.registerJob(writeDiagnosticEntry)
  ├─ jobDispatcher.registerJob(refreshMetrics)
  ├─ jobDispatcher.registerJob(updateExecutionCounters)
  └─ jobDispatcher.start()
       │  for each registered job, for each of its triggerEvents:
       ▼  eventBus.subscribe(triggerEventType, async (event) => executeJob(job, event))

... later, real business code runs (savePurchaseFromCart, createItem, etc., 11B) ...
  │  eventBus.publish(EVENT_TYPES.X, {...})     -- AFTER success, per 11B's own rule
  ▼
executeJob(definition, event)                          the ONE execution pipeline
  ├─ context = deriveTraceContextFromEvent(event)       reused from diagnostics/ (11C)
  ├─ run: PENDING -> RUNNING -> (COMPLETED | FAILED)     lifecycle/jobLifecycle.js
  ├─ diagnostics logger/timeline/metrics                 new instances, reused logic
  └─ never rethrows, never retries                       failure isolation
```

## 3. Files added (23 files, all new)

**Background Job Engine** (`js/services/jobs/`):

| File | Purpose |
|---|---|
| `index.js` | Public barrel; re-exports `jobDispatcher`/`startBackgroundInfrastructure` from `bootstrap/` |
| `shared/freezeDeep.js`, `shared/generateId.js`, `shared/now.js` | Self-contained primitives, same rationale as `events/`/`diagnostics/`'s own copies |
| `contracts/jobContract.js` | `createJobDefinition()`/`assertValidJobDefinition()`/`createJobOutput()` — the JobDefinition/JobInput/JobOutput shapes |
| `lifecycle/jobLifecycle.js` | `JOB_STATUS` (5 states) + immutable `createJobRun()`/`toRunning()`/`toCompleted()`/`toFailed()`/`toCancelled()` |
| `registry/jobIds.js` | `JOB_IDS` — the one place job id strings are written down |
| `registry/jobRegistry.js` | `createJobRegistry()` — register/get/list/getByTriggerEvent, rejects unknown/duplicate ids |
| `dispatcher/jobDispatcher.js` | `createJobDispatcher()` — the single execution pipeline, Event Bus integration, diagnostics integration, failure isolation |
| `jobs/writeDiagnosticEntryJob.js` | Demonstration job 1 — structured log entry on master-data creation |
| `jobs/refreshMetricsJob.js` | Demonstration job 2 — in-memory per-aggregate tally on transactional events |
| `jobs/updateExecutionCountersJob.js` | Demonstration job 3 — in-memory execution counter |
| `bootstrap/startBackgroundInfrastructure.js` | The one function real pages call; owns the shared `jobDispatcher` instance |
| `jobEngine.test.html` | Zero-build test harness, same convention as every other `.test.html` in this codebase |

**Documentation** (`docs/`, 3 files): `milestone-11d-job-engine-design.md`,
`milestone-11d-job-engine-report.md` (this document), `job-engine-architecture.md`.

## 4. Files modified (7, all identical one-import-plus-one-call additions)

| File | Change |
|---|---|
| `menu.html` | +1 import, +1 call to `startBackgroundInfrastructure()` after `requireAuth()` succeeds |
| `purchase.html` | same |
| `suppliers.html` | same |
| `stock.html` | same |
| `items.html` | same |
| `manufacturing.html` | same |
| `sale.html` | same |

No other line in any of these seven files changed — confirmed by `git diff` showing
exactly two added lines per file, zero removed lines, zero lines altered. `index.html`
was deliberately left unmodified (design doc §7 — it never calls `requireAuth()` and is
outside this milestone's defined startup pattern).

The 18 files modified by Milestones 11B remain byte-for-byte unchanged by this milestone
— confirmed by `git status` showing the identical 18 paths from the prior checkpoint,
untouched.

## 5. What was reused, unmodified

- `events/index.js`'s `eventBus`/`ALL_EVENTS`-adjacent public API (`subscribe`, real
  `EVENT_TYPES`) — imported, never modified.
- `diagnostics/index.js`'s `createStructuredLogger`, `createExecutionTimeline`,
  `createMetricsRecorder`, `deriveTraceContextFromEvent`, `describeError` — imported and
  instantiated fresh per dispatcher, never reimplemented.
- `js/supabaseClient.js`'s `requireAuth()` — called exactly as before by every page;
  not modified, not wrapped, not replaced.

## 6. Regression status

| Suite | Result |
|---|---|
| `js/services/jobs/jobEngine.test.html` (11D, new) | 54/54 ✅ |
| `js/services/diagnostics/diagnostics.test.html` | 68/68 ✅ (unchanged) |
| `js/services/events/eventBus.test.html` | 58/58 ✅ (unchanged) |
| `js/services/dataExchange/xml/xmlImport.test.html` | 87/87 ✅ (unchanged) |
| `js/services/dataExchange/xml/xmlExport.test.html` | 77/77 ✅ (unchanged) |
| `js/services/dataExchange/json/jsonImport.test.html` | 59/59 ✅ (unchanged) |
| `js/services/dataExchange/json/jsonExport.test.html` | 58/58 ✅ (unchanged) |
| `js/services/dataExchange/apnabill/apnabill.test.html` | 52/52 ✅ (unchanged) |
| `js/services/dataExchange/apnabill/apnabillRestore.test.html` | 72/72 ✅ (unchanged) |
| `js/services/dataExchange/migration/migration.test.html` | 48/48 ✅ |
| `js/services/dataExchange/dataExchange.test.html` | 43/43 ✅ |
| `js/ui/forms/forms.test.html` | 80/80 ✅ |
| **Total** | **736/736 ✅** |

Additionally, each of the seven modified HTML pages' inline `<script type="module">`
body was extracted and run through `node --check` — all seven parse cleanly, confirming
the two-line addition introduced no syntax error before the suites were even run.

## 7. New test coverage — 54 checks, one new suite

`jobEngine.test.html` covers every area the brief's "Testing" section names:

- **Job registration**: `createJobDefinition`/`assertValidJobDefinition` reject every
  missing-field case; `jobRegistry.register()` rejects an id not in `JOB_IDS` and rejects
  a duplicate registration (the "avoid string literals" guarantee, enforced at runtime).
- **Job dispatch**: a real `eventBus.publish()` on an isolated bus correctly triggers a
  registered job's handler, with the real triggering event passed through.
- **Lifecycle transitions**: all 5 `JOB_STATUS` values exist and no more;
  `PENDING → RUNNING → COMPLETED` and `→ FAILED` both verified via real dispatch;
  `toCancelled()` verified directly (reserved, unused by the dispatcher itself).
- **Event-to-job mapping**: one event type triggering two independently registered jobs
  (both run); `registry.getByTriggerEvent()` correctness.
- **Diagnostics integration**: the dispatcher's own logger/timeline/metrics are
  genuinely populated by real job executions (structured log entries, timeline entries
  labeled `job:<id>`, metrics duration samples) — not merely constructed and unused.
- **Context propagation**: a job's `input.context` carries through the real event's
  metadata fields (company/module/user) plus a generated `correlationId`, proving Job
  Context is genuinely derived from the same Trace Context diagnostics already builds,
  not a second implementation.
- **Failure isolation**: a throwing job handler never escapes `publish()`, a sibling job
  on the same trigger event still runs, a plain (non-job) Event Bus subscriber on the
  same event still runs, the failure is recorded as a `FAILED` `JobRun` and logged, and —
  explicitly — the failing handler is invoked exactly once per publish (no automatic
  retry).
- **Successful completion**: a `JobRun` reaching `COMPLETED` carries the job's own
  `JobOutput` unchanged.
- **No manual cross-module execution**: a job's handler is provably never called except
  as a result of a real `eventBus.publish()` reaching the dispatcher's own pipeline.
- **The three real demonstration jobs, end to end**: all three registered on an isolated
  dispatcher, all five of their real trigger event types published, each job's own
  output verified (structured log intent, tally, counter), plus an explicit passivity
  check (no output anywhere resembles a Supabase call or a DOM mutation).
- **`startBackgroundInfrastructure()` itself**: bound to the real, shared `eventBus`,
  proven idempotent (a second call returns the same dispatcher, registers nothing twice),
  and proven to actually reach a real registered job when a real event is published on
  the real shared bus.

## 8. Behavior notes

- Calling `startBackgroundInfrastructure()` from a page's `boot()` is synchronous and
  unawaited — it only subscribes to the Event Bus; it does not delay or alter any
  existing page-specific setup that follows it.
- No automatic retry exists anywhere in `jobs/` — a failed job is recorded and logged
  once per triggering event; it is never re-attempted for that same event.
- A job handler's `JobOutput` is intentionally small and structured — none of the three
  demonstration jobs' outputs contain anything resembling a database write or a UI
  action, verified directly in the test suite.

## 9. Remaining technical debt

- No persistence for job run history — by design (Audit's job, out of scope here); the
  in-memory `getRunHistory()` ring buffer (500 entries) is lost on every page navigation,
  same as every other in-memory platform state in this multi-page application.
- No retry policy exists anywhere — explicitly out of scope per the brief, not an
  oversight.
- `index.html` was left unwired (design doc §7) — if a future business event is ever
  published from that page, no job will observe it there; none currently are.

None of the above are milestone blockers; all are already disclosed in the design doc.

## 10. Final assessment

The repository gained one new, fully tested, fully documented Background Job Engine, plus
exactly two additive lines in each of seven pre-existing pages — no other line in any
existing file changed. All 54 new checks pass; every pre-existing suite (736 total checks
across 12 suites) remains green with identical counts to the prior checkpoint except the
new suite itself. **Milestone 11D is complete: the Background Job Engine exists, is wired
into the real application's existing startup flow, reuses the Event Bus and Diagnostics
Platform without modifying either, and is ready for the Audit Platform and a future
Plugin Framework to register jobs against.**
