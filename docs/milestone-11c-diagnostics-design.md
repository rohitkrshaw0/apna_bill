# Milestone 11C — Diagnostics & Observability Platform: Architecture Design

## 1. Goals

Build the production observability infrastructure future milestones (11D Audit, a future
Background Jobs milestone, a future Plugin Framework) will build on: structured logging,
a trace context, passive Event Bus observation, execution timing, error classification,
performance metrics, and reusable diagnostic report builders. This is infrastructure
only — no dashboard, no UI, no persistence, and (unlike 11B) no wiring of anything into
existing business code. Diagnostics observes; it never acts.

## 2. Current architecture (as it exists today)

Before this milestone, ApnaBill has two logging abstractions, both intentionally tiny and
scoped to their own platform: `dataExchange/shared/logging/` (a 4-argument
level/name/message/meta tuple, used only for that platform's own internal error
reporting) and `events/shared/logging/` (an identical copy, used only by the Event Bus's
own subscriber-failure reporting). Neither is structured beyond that tuple, neither has a
trace concept, and neither is meant for general application-wide use — both their own
header comments say so.

There is no error classification system beyond `dataExchange/shared/errors/`'s
`ERROR_CATEGORY` (file/schema/business/relationship/reference/duplicate/conflict/system),
which models the Validation Pipeline's own stages and is specific to that one platform.
There is no execution-timing infrastructure outside `dataExchange/progress/
progressTracker.js` (elapsed/estimated-remaining time for one in-flight migration run,
not a general-purpose timer). There is no performance-metrics or reporting infrastructure
anywhere. Confirmed by grep before writing any code: no `diagnostics`, `observability`,
`structuredLog`, or `traceContext` symbol exists anywhere in `js/`.

`docs/event-bus-architecture.md` §9 (written during 11A/11B) already anticipated this
milestone precisely: "11C Diagnostics — an `ALL_EVENTS` subscriber building a live event
stream/counter." This design follows that exactly.

## 3. Non-goals (explicit, from the brief)

Not built here: Background Jobs, an Audit platform, Notifications, Analytics, a Plugin
System, or a Monitoring Dashboard. Also not built here: any change to any existing
business file, service, validator, UI, or the database schema — confirmed at the end of
this milestone by `git status` showing only new files under `js/services/diagnostics/`
and three new doc files (§ report doc, "Files modified").

## 4. Key design questions answered

**Where does this platform live?** `js/services/diagnostics/`, a sibling of
`js/services/events/` and `js/services/dataExchange/` — not nested inside either. Its
only dependency is `events/`'s public barrel (`import { eventBus, ALL_EVENTS } from
'../../events/index.js'`); it imports nothing from `dataExchange/` and nothing from any
business file, matching the brief exactly ("Diagnostics may depend on events" — singular,
not "events and whatever else looks convenient").

**Does diagnostics reuse `events/shared/logging/` or `dataExchange/shared/logging/`?**
No — it owns its own, richer structured logger (`diagnostics/logging/`). Those two
existing loggers pass a 4-argument tuple to their sink; this milestone's own brief
requires "every log entry must be structured" as a first-class object with an embedded
trace context, which is a genuinely different (larger) contract, not a drop-in
replacement for either existing one. Building a third, incompatible logger under a name
that could be confused with either existing one would violate "do not introduce
unnecessary dependencies" in spirit if it reused them; owning a clean, self-contained
copy of the same *sink-injection pattern* (not the same code) keeps the platform boundary
exactly where the brief draws it.

**Does diagnostics get its own error-category taxonomy, or reuse `dataExchange`'s
`ERROR_CATEGORY`?** Its own — the brief names five categories (Validation, Business,
Infrastructure, Network, Unexpected) that don't map one-to-one onto dataExchange's eight
validation-pipeline-stage categories, and diagnostics observes the *whole application*,
not one platform. `classifyError()` still recognizes a dataExchange-shaped error by
matching its `.category` STRING VALUE (never by importing dataExchange's module — see §6)
so those errors still classify sensibly rather than all collapsing into `UNEXPECTED`.

**Can diagnostics see when another subscriber fails?** No, and this is a real,
documented limitation, not an oversight — see §7.

**Does diagnostics auto-start when imported?** No — see §8.

## 5. Design principles

1. **Passive, always.** Diagnostics only ever calls `eventBus.subscribe()`/
   `unsubscribe()`. No file under `diagnostics/` contains a call to `eventBus.publish()`
   anywhere — confirmed by grep, not just by policy.
2. **Self-protecting.** A bug inside diagnostics' own code must never reach the Event
   Bus's dispatch loop or affect a sibling subscriber — belt-and-suspenders on top of the
   bus's own per-subscriber isolation (11A design doc §12), not a replacement for it.
3. **Never fabricate data.** Trace context fields are copied through only when a
   publisher genuinely set them; a generated `correlationId` is diagnostics' own
   bookkeeping identifier, not business data (§9).
4. **Lightweight and bounded.** The execution timeline is a capped ring buffer, not
   unbounded storage — "production safe" per the brief's design goals.
5. **Additive extension.** A new diagnostics capability is a new file under
   `diagnostics/`, re-exported from its barrel — nothing about the Event Bus, or any
   existing diagnostics file, needs to change.

## 6. Proposed architecture

```
js/services/diagnostics/
  index.js                    public barrel + a constructed-but-not-started `diagnosticsObserver`
  logging/
    logLevels.js                LOG_LEVELS, LOG_LEVEL_PRIORITY
    structuredLogger.js          createStructuredLogger() -- debug/info/warn/error, withTrace()
    consoleSink.js, memorySink.js, index.js
  trace/
    traceContext.js              createTraceContext(), deriveTraceContextFromEvent()
  errors/
    errorClassifier.js           ERROR_CATEGORIES, classifyError(), describeError()
  timeline/
    executionTimeline.js         createExecutionTimeline() -- start/finish/time(), capped buffer
  metrics/
    metricsRecorder.js           createMetricsRecorder() -- event count, handler duration, dispatch latency
  observer/
    eventObserver.js             createEventObserver() -- the one ALL_EVENTS subscriber
  reports/
    diagnosticReportBuilder.js   createDiagnosticReport() -- structured snapshot, no UI
  shared/
    freezeDeep.js, generateId.js, now.js   self-contained primitives, see §4
  diagnostics.test.html
```

## 7. What this milestone cannot measure, and why

The brief asks for "subscriber latency" and to "capture failures inside subscribers."
The Event Bus (11A, frozen, not modified by this milestone) dispatches to each subscriber
inside its own private `try/catch` in `bus/eventBus.js`'s `dispatch()` — a failure there
is logged by the bus itself and returned to the *publisher* via `publish()`'s `{ errors
}`, but is never exposed to a *sibling subscriber*. Diagnostics, being just one more
subscriber, has exactly the same visibility any other subscriber has: its own execution,
and nothing about anyone else's. Two ways around this were considered and rejected:

- **Modify `bus/eventBus.js` to also notify wildcard subscribers of other subscribers'
  failures.** Rejected outright — 11C's own brief lists "Event Bus: COMPLETE" and this
  milestone's strict rules never authorize touching it; 11A's own design doc marks
  synchronous-only, notification-only dispatch as permanent architecture, not something
  to extend per-consumer.
- **Wrap every other subscriber transparently via monkey-patching `subscribe()`
  ourselves.** Rejected — fragile, order-dependent, and exactly the kind of "unnecessary
  dependency"/complexity the brief warns against for a "lightweight" platform.

What this platform *does* honestly measure instead: its own handler duration (how long
`eventObserver.js`'s own processing of each event takes) and dispatch latency (time
between an event's own `timestamp`, stamped inside `publish()`, and the moment this
subscriber received it). Both are real, measured values, not proxies for something this
architecture cannot see. This is disclosed as a known limitation (report doc), not
worked around.

## 8. Deliberately not started anywhere

Importing `diagnostics/index.js` has no observable effect — `diagnosticsObserver` is
*constructed* (a plain object, no subscription yet) but `.start()` is never called by
this milestone. No HTML page, bootstrap script, or business file was touched to wire it
in. This mirrors 11A's own precedent exactly (build the Event Bus, wire nothing into real
call sites until a dedicated integration milestone) and keeps this milestone's own
"backward compatibility" guarantee trivial to verify: since nothing subscribes unless
something explicitly calls `start()`, and nothing in this milestone does, the running
application's behavior is provably identical before and after — there is no live code
path to regress. Starting real observation (e.g. from a page's bootstrap script) is left
to whichever future milestone actually wants it running.

## 9. Trace Context vs. Event Context — one whitelist, one addition

`events/context/eventContext.js`'s whitelist (`user`, `company`, `requestId`, `source`,
`module`, `executionId`, `traceId`) is reused verbatim, not duplicated — `diagnostics/
trace/traceContext.js`'s own `TRACE_KEYS` is a superset containing exactly those seven
plus one genuinely new field, `correlationId`, which has no reason to exist inside the
Event Bus's own contract (it is a diagnostics-only bookkeeping concept for correlating
several observations that belong to one logical operation). `deriveTraceContextFromEvent()`
reads whatever a publisher already put in `event.metadata` — nothing more, nothing
invented — and only fills in `correlationId` when the caller didn't supply one, using the
same `crypto.randomUUID()`-based generator `events/contracts/eventEnvelope.js` already
uses for its own `id` field (precedent, not a new pattern).

## 10. Error classification model

Five categories (`ERROR_CATEGORIES`): `validation`, `business`, `infrastructure`,
`network`, `unexpected`. `classifyError()` never throws regardless of input shape
(`null`, a string, a frozen dataExchange-style object, a real `Error`). Classification
order: (1) a recognized dataExchange-style `.category` string maps directly; (2) a
message/name/code hinting at network failure (`/network|fetch|timeout|.../i`) classifies
`NETWORK`; (3) a native `TypeError`/`RangeError`/`ReferenceError` with no other hint
classifies `UNEXPECTED` (a likely programmer error, not a business one); (4) everything
else defaults to `UNEXPECTED` rather than guessing. `describeError()` wraps this into a
small, JSON-safe, non-mutable summary safe to embed in a timeline entry or log line.

## 11. Execution timeline and performance metrics

`createExecutionTimeline()` is a general-purpose, capped ring buffer (`start`/`finish`/
`time()`), usable for timing *any* operation, not only observed events —
`observer/eventObserver.js` is simply its first caller, timing its own per-event
processing. `time()`'s wrapped function's return value and thrown/rejected outcome both
pass through completely unchanged; this module has no capability to retry, correct, or
suppress an outcome, matching the brief's "architectural rules" section verbatim.
`createMetricsRecorder()` aggregates counts and duration statistics (count/avg/min/max)
per event type and overall — a plain, queryable object, not a chart or a dashboard.

## 12. Extension points for 11D / Background Jobs / Plugin Framework

- **11D Audit**: the natural next `ALL_EVENTS` subscriber, likely persisting
  `describeError()`-shaped summaries and `deriveTraceContextFromEvent()`-derived trace
  context per event. Diagnostics' own `createMemorySink()` pattern is the template for an
  eventual "audit sink" — no change to `observer/eventObserver.js` required; Audit is its
  own, separate subscriber.
- **Future Background Jobs**: can use `createExecutionTimeline()`/`createMetricsRecorder()`
  directly to time and measure its own job execution, independent of the Event Bus
  entirely (both are general-purpose, not Event-Bus-specific).
- **Future Plugin Framework**: a plugin that wants to log or time its own work can use
  `createStructuredLogger()`/`createExecutionTimeline()` the same way any first-party
  module does — no diagnostics-specific plugin API needed, since these are already plain,
  reusable factories.
- **A future Diagnostics Dashboard** (explicitly out of scope here): would call
  `createDiagnosticReport()` periodically and render its output — no change to this
  milestone's code required to support that.

## 13. Risks

- **A future caller starts `diagnosticsObserver` in a hot path without realizing every
  event now gets processed synchronously inside `publish()`'s own call stack.** Mitigated
  by this document and the code's own header comments stating plainly that the observer
  runs synchronously (inherited from the bus's own synchronous design, 11A §4) and by
  keeping the observer's own per-event work intentionally minimal (one log line, one
  timeline entry, one metrics update — no I/O).
- **Someone assumes "subscriber latency" metrics describe OTHER subscribers.** Mitigated
  by §7's explicit disclosure, repeated in the metrics module's own header comment and in
  the report doc.

## 14. Alternatives considered

- **Reuse `events/shared/logging/` directly instead of a new structured logger.**
  Rejected — its 4-argument sink contract cannot represent a trace-context-carrying
  structured entry without a breaking signature change to a frozen, "COMPLETE" 11A file.
- **Have diagnostics wrap `eventBus.subscribe()` itself to also time every OTHER
  subscriber.** Rejected in §7 — fragile and out of this milestone's authorized scope.
- **Give diagnostics its own copy of `dataExchange`'s `ERROR_CATEGORY` enum instead of a
  new taxonomy.** Rejected — the brief specifies a different, broader taxonomy by name;
  inventing a mapping the brief didn't ask for while ignoring the one it did would be
  scope substitution, not scope reduction.

## 15. Final recommendation

Build exactly the module described in §6, start nothing, touch no existing file, and
hand the finished, tested, documented platform to whichever milestone subscribes to it
next. §12 gives 11D and beyond enough to start without re-deriving any decision made
here.
