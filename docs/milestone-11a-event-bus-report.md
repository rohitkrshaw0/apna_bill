# Milestone 11A — Domain Event Bus: Report

Deliverables document for the internal Domain Event Bus. Covers what was actually built
and verified; consult `docs/milestone-11a-event-bus-design.md` for the full design
rationale (why each decision was made, alternatives considered, extension guidelines for
11B–11E) — not repeated here.

## 1. Objective

Build the internal, synchronous Domain Event Bus infrastructure — event envelope,
registry, bus, and optional context — that future milestones (11B Background Jobs, 11C
Diagnostics, 11D Audit, 11E Plugin System) will subscribe to. Zero changes to the Core
ERP, Shared Services, Shared Design System, or the Data Exchange Platform (XML/JSON/
Migration/Backup/Restore). No database schema change. No UI change. No workflow change.

## 2. Architecture implemented

```
eventBus.publish(EVENT_TYPES.X, { aggregateId, payload, context })
  │
  ├─ registry/eventTypes.js      resolves aggregate + version for the type,
  │                              throws TypeError for any unregistered type
  ├─ contracts/eventEnvelope.js  createDomainEvent() stamps id/timestamp,
  │                              deep-freezes the envelope
  ├─ context/eventContext.js     whitelists optional metadata (user/company/
  │                              requestId/source/module/executionId/traceId)
  └─ bus/eventBus.js             dispatches synchronously: specific-type
                                 subscribers (subscribe() order), then
                                 ALL_EVENTS subscribers (subscribe() order);
                                 each wrapped in its own try/catch, a failure
                                 is logged and skipped, never re-thrown
```

Architectural claim, verified not assumed: this milestone touches nothing outside the
new `js/services/events/` folder and two doc files — confirmed by `git status --porcelain`
showing only `?? js/services/events/` as new/changed against a clean starting tree, and by
re-running two existing regression suites (`migration.test.html`,
`json/jsonImport.test.html`) unmodified and getting the exact same pass counts as the
last release checkpoint (§6).

## 3. Files added

**Domain Event Bus** (`js/services/events/`, 11 files, all new):

| File | Purpose |
|---|---|
| `index.js` | Public barrel; also constructs and exports `eventBus`, the one shared application-wide bus instance |
| `contracts/eventEnvelope.js` | `createDomainEvent()` / `assertValidDomainEvent()` — the permanent envelope shape (id/type/timestamp/aggregate/aggregateId/version/payload/metadata), deep-frozen on creation |
| `registry/eventTypes.js` | `EVENT_TYPES` / `AGGREGATES` and the 14-entry initial event catalog — the single source of truth for event type strings; `getEventContract()`/`isKnownEventType()`/`listEventTypes()` |
| `context/eventContext.js` | `createEventContext()` — whitelists optional metadata, never forces any field |
| `bus/eventBus.js` | `createEventBus()` / `ALL_EVENTS` — publish/subscribe/unsubscribe, ordered dispatch, per-subscriber error isolation |
| `shared/freezeDeep.js` | Self-contained copy of the same deep-freeze primitive `dataExchange/shared/freezeDeep.js` uses (deliberately not imported cross-platform — see design doc §4) |
| `shared/logging/logger.js` | Sink-injected logger, `createLogger({ name = 'events', sink })`, same abstraction as `dataExchange/shared/logging/logger.js` |
| `shared/logging/consoleSink.js` | Default sink — routes to `console.error`/`warn`/`log` |
| `shared/logging/memorySink.js` | In-memory sink used by the test suite to assert on logged subscriber failures |
| `shared/logging/index.js` | Public barrel for the logging abstraction |
| `eventBus.test.html` | Zero-build test harness, same convention as every other `.test.html` in this codebase |

**Documentation** (`docs/`, 3 files, all new):

| File | Purpose |
|---|---|
| `milestone-11a-event-bus-design.md` | Full design rationale, alternatives considered, extension guidelines for 11B–11E |
| `milestone-11a-event-bus-report.md` | This document |
| `event-bus-architecture.md` | Permanent living reference for `js/services/events/`, organized by concept (mirrors `data-exchange-architecture.md`'s role for the Data Exchange Platform) |

## 4. Files modified

None. `git status --porcelain` at the end of this milestone shows exactly one new,
untracked path (`js/services/events/`) plus the three new doc files — no existing file's
content changed.

## 5. What was reused, unmodified

Nothing from `dataExchange/` was imported or reused — `events/` deliberately owns its own
copies of the two small primitives it needed (`freezeDeep.js`, the logging abstraction)
rather than reaching into another platform's `shared/` folder; see design doc §4 for why
that's the correct call here (unlike Milestone 10's `crc32.js` exception, there was no
cost to avoiding the cross-platform dependency entirely). No existing business module,
service, validator, or UI file was read from or written to by this milestone's
implementation.

## 6. Regression status

| Suite | Result |
|---|---|
| `js/services/events/eventBus.test.html` (11A, new) | 58/58 ✅ |
| `js/services/dataExchange/migration/migration.test.html` (9F, spot-check) | 48/48 ✅ (matches `json-platform-v1.0` checkpoint exactly) |
| `js/services/dataExchange/json/jsonImport.test.html` (10, spot-check) | 55/55 ✅ (matches `json-platform-v1.0` checkpoint exactly) |

Both pre-existing suites were re-run, unmodified, via the same
`python -m http.server` + headless Chrome `--dump-dom` convention every prior milestone
uses, and produced identical pass counts to the last release checkpoint
(`docs/releases/json-platform-v1.0.md`) — confirming this milestone introduced no
regression. The full 475-suite regression set was not re-run in its entirety for this
checkpoint since zero files it covers were touched (proven by `git status`, §4); the two
suites re-run here were chosen as the most integration-heavy (orchestration engine, full
round-trip) spot checks.

## 7. New test coverage

`eventBus.test.html` — 58 checks covering:

- Envelope shape, field defaults, id uniqueness, timestamp validity, required-field
  validation (`assertValidDomainEvent`), and deep immutability of both the event and its
  payload.
- Registry: catalog completeness (all 14 seed events), naming-convention enforcement
  (every type value is PascalCase, none begin with an imperative-command verb),
  `getEventContract`/`isKnownEventType`/`listEventTypes`, and that every contract's
  aggregate is a declared `AGGREGATES` entry.
- Event context: empty-by-default, whitelist-only key copying, unknown keys dropped.
- Bus core: publish/subscribe/unsubscribe (both the returned-function and explicit
  `bus.unsubscribe()` forms), ordered multi-subscriber dispatch, per-type isolation
  (a `SaleCreated` subscriber never sees a `PurchaseCreated` event), `subscriberCountFor`,
  and `clear()`.
- Rejection of unregistered event types and non-function handlers at both `publish()` and
  `subscribe()`.
- Subscriber isolation: a synchronously-throwing handler doesn't stop the next handler,
  doesn't escape `publish()`, is reported in `publish()`'s returned `errors` array, and is
  logged via an injected `memorySink`; the bus remains fully usable for subsequent
  publishes afterward.
- Async subscriber rejection: isolated the same way, without `publish()` ever becoming
  awaited/async itself.
- `ALL_EVENTS` wildcard subscription: observes every published type regardless of
  individual subscriptions, and runs after specific-type subscribers, deterministically.
- The exported `eventBus` singleton behaves identically to an isolated
  `createEventBus()` instance and is shared across every importer of `index.js`.

## 8. Behavior notes

- `publish()` is fully synchronous end-to-end; a subscriber's own async work is
  fire-and-forget from the bus's perspective (its eventual rejection is still caught and
  logged — see design doc §12).
- No event may be published for a type that isn't registered in
  `registry/eventTypes.js` — this is enforced at runtime with a `TypeError`, not merely
  documented as a convention.
- No call site anywhere in the existing application publishes or subscribes to anything
  yet — that wiring is explicitly deferred (design doc §15), since it would require
  touching Core ERP files this milestone's brief forbids modifying.

## 9. Remaining technical debt

- No event type currently has a validated payload schema — `payload` is an open object
  per type. `version` exists on every envelope specifically so a future payload-shape
  change can be detected without changing this bus; formal per-type payload contracts
  are left to whichever milestone first wires a real `publish()` call into business code.
- No persistence, replay, or ordering-across-page-reloads exists — this is a purely
  in-process, in-memory bus, matching the brief's "NOT a messaging queue" requirement
  exactly; anything beyond that is explicitly 11B/11D's concern, not this milestone's.
- The full 475-suite regression set from `json-platform-v1.0` was not re-run wholesale
  for this checkpoint (§6) — two integration-heavy suites were spot-checked instead,
  since `git status` already proves no file either suite could regress against was
  touched.

None of the above are milestone blockers; all are already disclosed here and in the
design doc.

## 10. Final assessment

The repository gained one new, fully isolated, fully tested infrastructure module and
three new documentation files. No existing file changed. All 58 new checks pass; the two
existing suites spot-checked as part of this milestone still pass with identical counts
to the last release checkpoint. **Milestone 11A is complete: the Domain Event Bus is
built, documented, tested, and ready for 11B–11E to build on.**
