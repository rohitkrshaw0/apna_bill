# Audit Platform — Architecture Reference

This is the permanent architectural reference for `js/services/audit/`, written for
whoever maintains or extends this module next. It describes the system **as it stands
today**, organized by concept, not by milestone. It does not repeat the rationale already
recorded in the milestone docs — consult those when you need the "why" behind a specific
decision:

- `docs/milestone-11e-audit-platform-design.md` — full design rationale, alternatives
  considered, the storage-abstraction tension
- `docs/milestone-11e-audit-platform-report.md` — what was actually built and verified

## 1. What this platform is

The Audit Platform records immutable business history. It is **not** a logging system,
not Diagnostics, not analytics, and not monitoring — those are different platforms with
different purposes. Audit records business *facts* (a purchase was created, a sale was
cancelled) as permanent, append-only records, one per observed Domain Event.

It lives entirely under `js/services/audit/`, is a sibling of `js/services/events/`,
`js/services/diagnostics/`, and `js/services/jobs/` (not nested inside any of them), and
depends on exactly two things outside itself: `events/`'s and `diagnostics/`'s public
barrels. As of this writing it has **zero live call sites** — importing it has no effect
until some future caller explicitly starts it (§10).

## 2. The layering — Audit is a peer, not a consumer

```
ERP
  │
  ▼
Domain Event Bus
  ├── Diagnostics
  ├── Background Jobs
  └── Audit Platform
```

Audit subscribes to the Event Bus **directly** — the same `ALL_EVENTS` mechanism
Diagnostics' own observer uses. It does **not** execute through the Job Engine; there is
no import from `jobs/` anywhere under `audit/`, confirmed by grep. Routing Audit through
Jobs is forbidden architecture, permanently — not a stylistic preference, an explicit
constraint from this platform's own design brief.

## 3. Module map and dependency direction

```
shared/                    <- no internal deps (self-contained; deliberately not
  freezeDeep.js, generateId.js   imported from events/shared/, diagnostics/shared/, or jobs/shared/)
  ↑
registry/                   <- events/ (EVENT_TYPES, for the audited-type catalog's keys)
  auditRegistry.js
  ↑
contracts/                  <- shared/
  auditRecord.js
  ↑
store/                      <- no internal deps
  auditStore.js
  ↑
query/                      <- store/ (the IAuditStore contract only)
  auditQueryApi.js
  ↑
subscriber/                 <- events/ (eventBus, ALL_EVENTS), diagnostics/ (logger/
  auditSubscriber.js            timeline/metrics/trace/errors), registry/, contracts/,
                                 store/  -- the only file that imports from events/
  ↑
index.js                    <- re-exports everything above; constructs (does not start)
                                `auditSubscriber`
```

`subscriber/auditSubscriber.js` is the only file in this platform that imports from
`events/`. `query/auditQueryApi.js` is written only against `store/auditStore.js`'s
contract, never against the in-memory implementation's internals — a future store swap
needs no change there.

## 4. Public API (`js/services/audit/index.js`)

```js
import { auditSubscriber, createAuditSubscriber, createAuditQueryApi, createInMemoryAuditStore } from '<path>/services/audit/index.js';
```

| Export | Kind | Purpose |
|---|---|---|
| `auditSubscriber` | instance | The one shared, application-wide subscriber. Constructed, **not started**. |
| `createAuditSubscriber({ eventBus?, store?, logger?, timeline?, metrics? })` | factory | An isolated subscriber — for tests, or a deliberately separate instance. |
| `isAuditedEventType(type)` / `getAuditRecordVersion(type)` / `listAuditedEventTypes()` | functions | Registry lookups (§6). |
| `createAuditRecord({ event, traceContext, auditRecordVersion })` / `assertValidAuditRecord(record)` | functions | The ten-field envelope (§7). |
| `assertValidAuditStore(store)` / `createInMemoryAuditStore()` | functions | The storage contract + reference implementation (§8). |
| `createAuditQueryApi(store)` | factory | The five lookup functions (§9). |

### `auditSubscriber`'s methods

```js
auditSubscriber.start();       // -> true, or false if already running (idempotent)
auditSubscriber.stop();        // -> true, or false if already stopped (idempotent)
auditSubscriber.isRunning();   // -> boolean
auditSubscriber.store;         // this subscriber's own IAuditStore instance
auditSubscriber.timeline / .metrics / .logger;   // this subscriber's own diagnostics instances
```

## 5. Audit lifecycle

There is no separate "lifecycle" state machine the way the Job Engine has one
(`PENDING`/`RUNNING`/`COMPLETED`/`FAILED`/`CANCELLED`) — an audit record has exactly one
state: it exists, immutably, from the moment it is created. The subscriber's own
lifecycle is just `start()`/`stop()`/`isRunning()`, identical in shape to Diagnostics'
observer.

## 6. The Audit Registry

`registry/auditRegistry.js` is the single source of truth for which event types are
audited and what audit-record schema version applies to each. Every event type currently
in `events/registry/eventTypes.js` has an entry here. A **future** event type is not
audited automatically — it must be deliberately added to this registry too (a considered
design choice: an audit trail that silently grows to cover new event types with no
explicit decision is a weaker guarantee than one where every audited fact was consciously
opted in). An unregistered event type is handled gracefully by the subscriber: logged as
a warning, no record created, never thrown.

## 7. The Audit Record Contract

```
auditId        unique per audit record (crypto.randomUUID())
eventId        the observed DomainEvent's own id
eventType      e.g. "PurchaseCreated"
aggregate      e.g. "purchase"
aggregateId    identifies which instance
timestamp      ISO-8601, when THIS audit record was created
traceContext   diagnostics' derived TraceContext (§11)
metadata       the event's own, raw, publisher-supplied metadata, unchanged
payload        the event's own payload, unchanged
version        this audit record's own schema version, from the registry (§6)
```

Every record is deep-frozen at construction by `createAuditRecord()` — this is the
platform's immutability guarantee (§12).

## 8. Storage abstraction

`store/auditStore.js`'s `assertValidAuditStore(store)` is the contract every store
implementation must satisfy: `append(record)`, `getById(auditId)`, `list()`. The one
shipped implementation, `createInMemoryAuditStore()`, is **deliberately unbounded** — it
never evicts a record, unlike Diagnostics' `ExecutionTimeline` or the Job Engine's run
history, both of which cap their buffers. Capping would silently violate this platform's
"never deleted, append-only" guarantee; the resulting unbounded-memory-growth risk over a
very long, high-volume session is a disclosed, real limitation of *this specific
in-memory implementation* — not of the architecture, which exists precisely so a future
persistent store (a real database table, added in its own milestone with an explicit
schema change) can implement the same contract without any change to `subscriber/` or
`query/`.

## 9. Query API

`createAuditQueryApi(store)` returns five functions, all read-only, all written only
against the `IAuditStore` contract:

```js
byAuditId(auditId)                    // -> AuditRecord | null
byAggregate(aggregate, aggregateId?)  // -> AuditRecord[] (aggregateId optional -- omit for every record of that aggregate TYPE)
byEventType(eventType)                // -> AuditRecord[]
byTimeRange(fromIso, toIso)           // -> AuditRecord[] (inclusive ISO-8601 bounds)
byTraceId(traceId)                    // -> AuditRecord[] (matches traceContext.traceId OR traceContext.correlationId)
```

`byTraceId` matches on `correlationId` too because no real publisher in this codebase
sets `traceId` explicitly as of this milestone (11B never set it) — `correlationId` is
always present (diagnostics generates one per event) and serves the same
"these observations belong together" purpose. If a future publisher starts setting
`traceId` explicitly, both continue to work identically.

## 10. Current call sites

**None.** `auditSubscriber` (exported from `index.js`) is constructed but not started by
this milestone — this milestone's own brief, unlike 11D's, gave no instruction to
register it during application initialization, so none was added. The first real caller
of `.start()` will be whichever future milestone wants a live audit trail running.

## 11. Trace integration

There is no `auditTraceContext.js` and no second context system anywhere in this
platform. `subscriber/auditSubscriber.js` calls `diagnostics/trace/traceContext.js`'s
`deriveTraceContextFromEvent(event)` directly — the identical function Diagnostics'
observer (11C) and the Job Engine's dispatcher (11D) already call. An audit record's
`traceContext` field is exactly what that function returns.

## 12. Immutability guarantees

- Every `AuditRecord` is deep-frozen by `createAuditRecord()` before it is ever returned.
- `createInMemoryAuditStore()`'s `append()` only ever pushes; there is no `update`,
  `remove`, or `clear` method anywhere on the store contract or its reference
  implementation.
- The Query API is entirely read-only — none of its five functions can mutate a stored
  record.

## 13. Error handling and failure isolation

A failure anywhere inside `onEvent()` — a broken store, a malformed event — is caught,
classified via `diagnostics/errors/errorClassifier.js`, logged, and **never rethrown**.
No retry logic exists anywhere in this platform. A failing audit observation never
blocks, rolls back, modifies, or retries the ERP operation that published the triggering
event, and never affects a sibling Event Bus subscriber (Diagnostics, the Job Engine, or
any other).

## 14. How to extend this platform

**Audit a new event type**: add it to `registry/auditRegistry.js`'s
`AUDIT_RECORD_VERSIONS`. Nothing in `subscriber/`, `contracts/`, `store/`, or `query/`
needs to change.

**Add a real persistent store**: implement `append`/`getById`/`list` satisfying
`assertValidAuditStore()`; pass it as `createAuditSubscriber({ store })`. No change to
`subscriber/` or `query/` internals.

**Consume audit records from a future Plugin Framework or Analytics**: use
`createAuditQueryApi(auditSubscriber.store)` directly — read-only, no plugin-specific
mechanism needed.

**Start real auditing**: call `auditSubscriber.start()` from wherever a future
milestone's own bootstrap runs (the same pattern 11D used for
`startBackgroundInfrastructure()`).

## 15. Plugin Framework and future Analytics integration

- **11F Plugin & Extension Framework** — done. `js/services/extensions/` gives every
  extension read-only Query API access (`context.audit.query`) via its own
  `ExtensionContext` — no plugin-specific audit mechanism was needed, exactly as
  anticipated. See `docs/extension-framework-architecture.md` §6. This closes the
  approved infrastructure roadmap (11A–11F).
- **Future Analytics** — reads via `byAggregate`/`byEventType`/`byTimeRange` rather than
  re-observing the Event Bus itself, since Audit is already the durable historical
  record analytics would otherwise have to reconstruct independently.
- **Real persistence** — see §8 and §14.
