# Milestone 11C — Diagnostics & Observability Platform: Report

Deliverables document for the Diagnostics & Observability Platform. Covers what was
actually built and verified; consult `docs/milestone-11c-diagnostics-design.md` for the
full design rationale (why each decision was made, alternatives considered, extension
points for 11D and beyond) — not repeated here.

## 1. Objective

Build passive observability infrastructure — structured logging, trace context, Event
Bus observation, execution timing, error classification, performance metrics, and
diagnostic report builders — that future milestones (11D turned out to be the Background
Job Engine, the first real consumer; the Audit Platform and a future Plugin Framework
remain open) will build on. Zero changes to the Core ERP, Shared
Services, Data Exchange Platform, or the Event Bus/Integration (11A/11B). No database
schema change. No UI change. No workflow change. No business logic change.

## 2. Architecture implemented

```
diagnosticsObserver.start()
  │
  ▼
eventBus.subscribe(ALL_EVENTS, onEvent)     -- the ONE subscription this platform makes,
  │                                             read-only, never eventBus.publish()
  ▼
onEvent(event)  [self-protected in its own try/catch]
  ├─ timeline.start()                       execution timeline (Milestone 11C §"Execution Timeline")
  ├─ deriveTraceContextFromEvent(event)      trace context, from event.metadata only
  ├─ logger.withTrace(trace).debug(...)      structured log entry
  ├─ timeline.finish()  -> TimelineEntry
  └─ metrics.recordEvent(event, { handlerDurationMs, dispatchLatencyMs })
                                             performance metrics (Milestone 11C §"Performance Metrics")

createDiagnosticReport({ metrics, timeline })  -- structured snapshot, for future tooling
```

Architectural claim, verified not assumed: this milestone touches nothing outside the new
`js/services/diagnostics/` folder and three new doc files — confirmed by `git status
--porcelain` showing the same 18 modified files as the end of Milestone 11B, unchanged,
plus only new/untracked additions. `diagnostics/` imports exclusively from `events/`'s
public barrel; grep confirms zero imports from `dataExchange/` or any business file
anywhere under `diagnostics/`, and zero references to `eventBus.publish` anywhere in the
same tree.

## 3. Files added (16 files, all new)

| File | Purpose |
|---|---|
| `index.js` | Public barrel; constructs (but does not start) `diagnosticsObserver`, the shared observer bound to the application-wide `eventBus` |
| `shared/freezeDeep.js`, `shared/generateId.js`, `shared/now.js` | Self-contained primitives (deep-freeze, id generation, monotonic clock) — see design doc §4 on why these are owned copies, not cross-platform imports |
| `logging/logLevels.js` | `LOG_LEVELS`/`LOG_LEVEL_PRIORITY` — debug/info/warn/error and their filter priority |
| `logging/structuredLogger.js` | `createStructuredLogger()` — every entry a structured `LogEntry` object; `minLevel` filtering (environment-awareness); `withTrace()` for binding a trace context once |
| `logging/consoleSink.js`, `logging/memorySink.js`, `logging/index.js` | Pluggable sinks + barrel, same sink-injection pattern `events/shared/logging/` and `dataExchange/shared/logging/` already established |
| `trace/traceContext.js` | `createTraceContext()`/`deriveTraceContextFromEvent()` — the eight-field Trace Context, seven fields reused verbatim from `events/context/eventContext.js`'s own whitelist, one new (`correlationId`) |
| `errors/errorClassifier.js` | `ERROR_CATEGORIES`, `classifyError()`, `describeError()` — the five-category error model the brief specifies |
| `timeline/executionTimeline.js` | `createExecutionTimeline()` — start/finish/`time()`, capped ring buffer, error passthrough never swallowed |
| `metrics/metricsRecorder.js` | `createMetricsRecorder()` — event count, handler duration, dispatch latency aggregates |
| `observer/eventObserver.js` | `createEventObserver()` — the one passive `ALL_EVENTS` subscriber, self-protected |
| `reports/diagnosticReportBuilder.js` | `createDiagnosticReport()` — structured snapshot combining metrics + timeline, no UI |
| `diagnostics.test.html` | Zero-build test harness, same convention as every other `.test.html` in this codebase |

**Documentation** (`docs/`, 3 files, all new): `milestone-11c-diagnostics-design.md`,
`milestone-11c-diagnostics-report.md` (this document), `diagnostics-architecture.md` (the
permanent living reference).

## 4. Files modified

None. `git status --porcelain` at the end of this milestone shows the identical 18
modified files Milestone 11B left behind, byte-for-byte unchanged by this milestone, plus
new/untracked paths only.

## 5. What was reused, unmodified

`events/index.js`'s public barrel (`eventBus`, `ALL_EVENTS`, `createEventBus`,
`EVENT_TYPES`) — imported, never modified. Nothing from `dataExchange/` was imported
anywhere in this platform (confirmed by grep); `errorClassifier.js` recognizes
dataExchange-shaped errors by matching category STRING VALUES only (design doc §4, §10),
not by importing that platform's module.

## 6. Regression status

| Suite | Result |
|---|---|
| `js/services/diagnostics/diagnostics.test.html` (11C, new) | 68/68 ✅ |
| `js/services/events/eventBus.test.html` | 58/58 ✅ (unchanged) |
| `js/services/dataExchange/xml/xmlImport.test.html` | 87/87 ✅ (unchanged since 11B) |
| `js/services/dataExchange/xml/xmlExport.test.html` | 77/77 ✅ (unchanged since 11B) |
| `js/services/dataExchange/json/jsonImport.test.html` | 59/59 ✅ (unchanged since 11B) |
| `js/services/dataExchange/json/jsonExport.test.html` | 58/58 ✅ (unchanged since 11B) |
| `js/services/dataExchange/apnabill/apnabill.test.html` | 52/52 ✅ (unchanged since 11B) |
| `js/services/dataExchange/apnabill/apnabillRestore.test.html` | 72/72 ✅ (unchanged since 11B) |
| `js/services/dataExchange/migration/migration.test.html` | 48/48 ✅ |
| `js/services/dataExchange/dataExchange.test.html` | 43/43 ✅ |
| `js/ui/forms/forms.test.html` | 80/80 ✅ |
| **Total** | **702/702 ✅** |

Every suite re-run headlessly (`python -m http.server` + Chrome `--headless=new
--dump-dom`), the same convention every prior milestone uses. Every count matches its
prior checkpoint exactly except the new `diagnostics.test.html` suite. Zero failures
anywhere. `node --check` was also run against all 15 new `.js` files before the suite ran,
confirming no parse error.

## 7. New test coverage — 68 checks, one new suite

`diagnostics.test.html` covers every area the brief's "Testing" section names:

- **Structured logging**: all four levels reach the sink with the full documented
  `LogEntry` shape; `minLevel` filtering (the "environment-awareness" mechanism);
  `withTrace()` binding.
- **Trace propagation**: `createTraceContext()`'s whitelist + auto-generated
  `correlationId` (never colliding across calls, never overwritten when supplied);
  `deriveTraceContextFromEvent()` copying real event metadata through un-fabricated, and
  correctly producing a mostly-empty trace for a zero-context event.
- **Error classification**: all five categories, including dataExchange-shaped
  category-string mapping, network-message heuristics, native error-type fallback, and
  graceful handling of `null`/`undefined`/plain strings without ever throwing.
- **Execution timing**: manual `start`/`finish`, `time()` for both sync and async
  functions on both the success and failure path (proving the wrapped outcome — return
  value or thrown/rejected error — passes through completely unchanged), and ring-buffer
  capping.
- **Performance metrics**: count/avg/min/max aggregation correctness, per-type bucketing,
  non-negative dispatch latency, frozen snapshots, and `clear()`.
- **Event observation**: `start()`/`stop()` idempotency, real end-to-end observation of a
  published event (logging + trace + timeline + metrics all firing together), no
  observed-event feedback loop from the observer's own (nonexistent) publishing, and that
  a sibling subscriber still sees the untouched, frozen event.
- **Subscriber isolation**: a forced internal failure inside the observer's own
  processing (via an injected logger whose `debug()` throws) never escapes `publish()`,
  never stops a sibling subscriber, is caught and logged by the observer's own
  self-protection, and the bus remains fully usable for subsequent publishes.
- **Diagnostic report builder**: full documented shape, frozen output, and graceful
  handling of missing inputs.

## 8. Behavior notes

- Importing `diagnostics/index.js` has zero observable effect on the running
  application — `diagnosticsObserver` is constructed but not started, and this milestone
  calls `.start()` nowhere (design doc §8). There is therefore no live code path this
  milestone could regress in the existing application, by construction.
- Diagnostics cannot observe another subscriber's failure — only its own (design doc §7).
  This is disclosed as an architectural limitation of the frozen, synchronous Event Bus,
  not a bug.
- `classifyError()`/`describeError()` never throw regardless of input shape, making them
  safe to call from any future error-handling path without an additional guard.

## 9. Remaining technical debt

- No real subscriber besides the observer's own self-logging exists yet — this platform
  is inert in production until a future milestone calls `diagnosticsObserver.start()`
  from a real bootstrap (deliberately out of this milestone's scope, design doc §8).
- Cross-subscriber failure visibility (design doc §7) would require a Event Bus change
  this milestone is not authorized to make — flagged as a possible future Event Bus
  enhancement, not attempted here.
- No persistence for any collected metrics/timeline/log data — by design ("no audit
  logs," per the brief); the Audit Platform is the natural place for persistence to be
  introduced.

None of the above are milestone blockers; all are already disclosed in the design doc.

## 10. Final assessment

The repository gained one new, fully isolated, fully tested, and fully documented
observability platform. No existing file changed. All 68 new checks pass; every
pre-existing suite (702 total checks across 11 suites) remains green with identical
counts to the prior checkpoint. **Milestone 11C is complete: the Diagnostics &
Observability Platform is built, documented, tested, and ready for 11D and beyond to
build on.**
