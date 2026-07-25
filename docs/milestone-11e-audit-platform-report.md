# Milestone 11E — Audit Platform: Report

Deliverables document for the Audit Platform. Covers what was actually built and
verified; consult `docs/milestone-11e-audit-platform-design.md` for the full design
rationale (why each decision was made, alternatives considered, the storage-abstraction
tension) — not repeated here.

## 1. Objective

Build an immutable, append-only record of business history as a first-class Domain
Event Bus subscriber — a peer of Diagnostics (11C) and the Job Engine (11D), never routed
through either. Zero changes to the ERP, the Event Bus, Diagnostics, the Job Engine,
Validation, Services, or UI.

## 2. Architecture implemented

```
ERP -> Business Logic -> Domain Event -> eventBus.publish()
                                              │
                                              ▼
                          eventBus.subscribe(ALL_EVENTS, onEvent)   -- audit/'s ONE subscription,
                                              │                        direct, not through jobs/
                                              ▼
                          onEvent(event)  [self-protected in its own try/catch]
                            ├─ isAuditedEventType(event.type)?  no  -> warn, skip, never throw
                            ├─ yes -> traceContext = deriveTraceContextFromEvent(event)
                            ├─ record = createAuditRecord({ event, traceContext, version })  -> frozen
                            ├─ store.append(record)                 -- unbounded, append-only
                            └─ diagnostics: timeline entry, structured log, metrics sample

createAuditQueryApi(store)  -- byAuditId / byAggregate / byEventType / byTimeRange / byTraceId
```

Architectural claim, verified not assumed: this milestone touches nothing outside the new
`js/services/audit/` folder and three new doc files — confirmed by `git status
--porcelain` showing only `?? js/services/audit/` as new against an otherwise clean tree.
`audit/` imports exclusively from `events/` and `diagnostics/`'s public barrels; grep
confirms zero imports from `jobs/`, `dataExchange/`, or any business file anywhere under
`audit/`, and zero references to `eventBus.publish`/`jobDispatcher`/`registerJob`
anywhere in the same tree.

## 3. Files added (11 files, all new)

| File | Purpose |
|---|---|
| `index.js` | Public barrel; constructs (but does not start) `auditSubscriber`, the shared subscriber bound to the application-wide `eventBus` |
| `registry/auditRegistry.js` | `isAuditedEventType()`/`getAuditRecordVersion()`/`listAuditedEventTypes()` — the audit-record schema-version catalog, one entry per currently-registered event type, a deliberate opt-in gate for future ones |
| `contracts/auditRecord.js` | `createAuditRecord()`/`assertValidAuditRecord()` — the ten-field, deep-frozen `AuditRecord` envelope |
| `store/auditStore.js` | `assertValidAuditStore()` (the storage contract) + `createInMemoryAuditStore()` (unbounded, append-only reference implementation) |
| `query/auditQueryApi.js` | `createAuditQueryApi(store)` — `byAuditId`/`byAggregate`/`byEventType`/`byTimeRange`/`byTraceId` |
| `subscriber/auditSubscriber.js` | `createAuditSubscriber()` — the one `ALL_EVENTS` subscriber, self-protected, never publishes, never routes through the Job Engine |
| `shared/freezeDeep.js`, `shared/generateId.js` | Self-contained primitives (deep-freeze, id generation) — see design doc §4 for why these are owned copies, not cross-platform imports |
| `audit.test.html` | Zero-build test harness, same convention as every other `.test.html` in this codebase |

**Documentation** (`docs/`, 3 files, all new): `milestone-11e-audit-platform-design.md`,
`milestone-11e-audit-platform-report.md` (this document), `audit-platform-architecture.md`.

## 4. Files modified

None. `git status --porcelain` at the end of this milestone shows exactly one new,
untracked path (`js/services/audit/`) plus the three new doc files.

## 5. What was reused, unmodified

`events/index.js`'s public barrel (`eventBus`, `ALL_EVENTS`, `createEventBus`,
`EVENT_TYPES`) and `diagnostics/index.js`'s public barrel (`createStructuredLogger`,
`createExecutionTimeline`, `createMetricsRecorder`, `deriveTraceContextFromEvent`,
`describeError`) — imported, never modified. Nothing from `jobs/` or `dataExchange/` was
imported anywhere in this platform (confirmed by grep) — Audit subscribes directly to
the Event Bus, exactly as the brief requires, never through the Job Engine.

## 6. Regression status

| Suite | Result |
|---|---|
| `js/services/audit/audit.test.html` (11E, new) | 62/62 ✅ |
| `js/services/jobs/jobEngine.test.html` | 54/54 ✅ (unchanged) |
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
| **Total** | **818/818 ✅** |

Every suite re-run headlessly (`python -m http.server` + Chrome `--headless=new
--dump-dom`), the same convention every prior milestone uses. Every count matches its
prior checkpoint exactly except the new `audit.test.html` suite (756 at
`infrastructure-platform-v1.0` + 62 new = 818). `node --check` was also run against all 8
new `.js` files before the suite ran, confirming no parse error.

## 7. New test coverage — 62 checks, one new suite

`audit.test.html` covers every area the brief's "Testing" section names:

- **Audit subscriber registration**: `start()`/`stop()` idempotency, subscribing via the
  real `ALL_EVENTS` mechanism.
- **Audit record creation**: one record per observed event, every field correctly
  populated (`eventId`/`eventType`/`aggregate`/`aggregateId` from the event,
  `payload`/`metadata` unchanged, `version` from the registry, a unique `auditId`
  distinct from `eventId`, a valid ISO `timestamp`).
- **Record immutability**: the record and its nested `payload` are both frozen; a
  mutation attempt either throws (strict mode) or silently no-ops.
- **Trace propagation**: `traceContext` carries the event's real metadata
  (company/module/user) through, plus a generated `correlationId` even when the
  publisher never set one.
- **Query API**: all five functions (`byAuditId`, `byAggregate` with and without an
  `aggregateId` filter, `byEventType`, `byTimeRange`, `byTraceId` matching both an
  explicit `traceId` and a `correlationId` fallback), plus contract-violation rejection.
- **Failure isolation**: a broken store's `append()` throwing never escapes `publish()`,
  a sibling (non-audit) subscriber on the same event still runs, the failure is logged
  once per publish with no automatic retry, and the bus remains fully usable afterward.
- **Event ordering**: three published events produce audit records in the exact same
  order.
- **Event correlation**: two different event *types*, published with the same explicit
  `context.traceId`, are both found together via `byTraceId` — and an event with a
  different `traceId` is correctly excluded.
- **Unregistered event type**: handled gracefully — `handleEvent()` never throws, no
  record is created, a warning is logged instead (registry/auditRegistry.js's own
  deliberate opt-in-gate design, design doc §9).
- **The shared `auditSubscriber` singleton**: constructed but not started by default;
  once started, records a real event published on the real shared `eventBus`.

## 8. Behavior notes

- `auditSubscriber` (exported from `index.js`) is constructed but never started by this
  milestone — importing `audit/index.js` has zero effect on the running application, and
  no HTML page or bootstrap script was touched (unlike 11D, this milestone's brief gave
  no instruction to wire live startup).
- No event may be recorded for a type not registered in `registry/auditRegistry.js` —
  enforced at runtime by a graceful skip-and-warn, not a crash.
- The in-memory `createInMemoryAuditStore()` is deliberately unbounded — it never evicts
  a record, honoring the "never deleted, append-only" requirement literally, at the cost
  of unbounded memory growth over a very long, high-volume session (§9, disclosed not
  hidden).

## 9. Remaining technical debt

- **No real persistence.** The one shipped store implementation is in-memory and lost on
  every page navigation, same as every other in-memory platform state in this multi-page
  application (Diagnostics' timeline, the Job Engine's run history). The storage
  abstraction (`assertValidAuditStore`) exists specifically so a future milestone can add
  a real persistent store without touching the subscriber or query API — not attempted
  here since it would require a database schema change this milestone does not
  authorize.
- **Unbounded memory growth** in the in-memory reference store over a very long,
  high-event-volume session — a real, disclosed tension between "never deleted" and
  "memory safe" for an in-memory implementation specifically (design doc §7), resolved
  architecturally (the abstraction), not operationally (no cap was added, since capping
  would silently violate "never deleted").
- **No live subscriber running anywhere** — `auditSubscriber.start()` is never called by
  this milestone. A future milestone wires it in, the same way 11D wired
  `startBackgroundInfrastructure()` into real pages.

None of the above are milestone blockers; all are already disclosed in the design doc.

## 10. Final assessment

The repository gained one new, fully isolated, fully tested infrastructure module and
three new documentation files. No existing file changed. All 62 new checks pass; every
pre-existing suite (818 total checks across 13 suites) remains green with identical
counts to the prior checkpoint. **Milestone 11E is complete: the Audit Platform is built,
documented, tested, and ready to be started by a future milestone — subscribing directly
to the Domain Event Bus, exactly as designed, never through the Job Engine.**
