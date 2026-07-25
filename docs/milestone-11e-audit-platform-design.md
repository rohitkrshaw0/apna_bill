# Milestone 11E — Audit Platform: Architecture Design

## 1. Goals

Build the Audit Platform: an immutable, append-only record of business history, built as
a first-class Domain Event Bus subscriber — a peer of Diagnostics (11C) and the Job
Engine (11D), never routed through either. Audit observes; it never controls, retries, or
influences anything, and it never modifies the ERP, the Event Bus, Diagnostics, or the
Job Engine.

## 2. Current architecture (as it exists today)

Read in full before any code was written: `docs/architecture/platform-roadmap.md`,
`docs/event-bus-architecture.md`, `docs/diagnostics-architecture.md`,
`docs/job-engine-architecture.md`, and the 11A–11D milestone reports. Three facts from
that reading shaped this design directly:

1. **The layering is already explicit and settled.** The "final instruction" that
   accompanied this milestone's brief states it plainly: `ERP → Domain Event Bus →
   {Diagnostics, Background Jobs, Audit Platform}` — three independent, sibling
   subscribers, not a chain. `docs/event-bus-architecture.md` §9 and
   `docs/diagnostics-architecture.md` §12 both already named Audit as "the natural next
   `ALL_EVENTS` subscriber" back when 11C was written — this milestone is that consumer,
   confirming the anticipated design rather than inventing a new one.
2. **11D already proved the reuse pattern this milestone follows.** The Job Engine
   constructs its own fresh instances of `diagnostics/`'s `createStructuredLogger()`/
   `createExecutionTimeline()`/`createMetricsRecorder()` and calls
   `deriveTraceContextFromEvent()` directly rather than inventing a second logging or
   context system. Audit does exactly the same thing, for the same reason: "do not
   duplicate diagnostics logic," "reuse the existing Trace Context."
3. **Diagnostics' own observer (11C) is still never started.** Audit's own subscriber
   follows the identical precedent (§8) — this milestone's brief gives no instruction to
   wire live startup into real pages (unlike 11D's explicit "register during application
   initialization" rule), so none was added.

## 3. Non-goals (explicit, from the brief)

Not built here: a Plugin Framework, Analytics, a Monitoring Dashboard, a Reporting UI,
Notifications, Permissions, or User Management. Not modified here: the ERP, the Event
Bus, Diagnostics, the Job Engine, Validation, Services, or UI.

## 4. Key design questions answered

**Where does this platform live?** `js/services/audit/`, a sibling of `events/`,
`diagnostics/`, and `jobs/`. Its only dependencies are `events/` and `diagnostics/`'s
public barrels — confirmed by grep: zero imports from `jobs/`, `dataExchange/`, or any
business file anywhere under `audit/`, and zero calls to `eventBus.publish` anywhere in
the same tree.

**Why not consume events through the Job Engine?** The brief is explicit and the "final
instruction" repeats it: "Audit does NOT execute through the Job Engine. Audit subscribes
directly to Domain Events." Routing through Jobs would make Audit's own correctness
depend on the Job Engine's dispatch pipeline (registry lookups, job lifecycle, its own
failure-isolation layer) for no benefit — Audit needs exactly what Diagnostics already
gets directly from the bus: every event, synchronously, in order, with no intermediary.

**What is the "Audit Registry" a registry of, given every event already has a canonical
type in `events/registry/eventTypes.js`?** Not a second catalog of event *names* — a
catalog of the audit *record's own schema version* per event type, deliberately
independent of the event envelope's own `version` field (an audit record's shape can
evolve on its own timeline). It doubles as an explicit opt-in gate: a future event type is
not audited until someone deliberately adds it here (§9).

**Does the Audit Store persist to a real database?** No — this milestone authorizes no
schema change. `store/auditStore.js` defines the storage *contract*
(`assertValidAuditStore`) and ships one in-memory reference implementation. A future
milestone can implement the same contract against a real persistent store without
touching the subscriber or query API at all (§7).

## 5. Design principles

1. **Audit is a peer, not a consumer, of Diagnostics or Jobs.** One `eventBus.subscribe(ALL_EVENTS, ...)`
   call, made directly by `audit/`, mirroring `diagnostics/observer/eventObserver.js`'s
   own shape exactly.
2. **Immutable, always.** Every `AuditRecord` is deep-frozen at construction; the
   in-memory store never edits, rewrites, or evicts an appended record (§7).
3. **Self-protecting, isolated, non-retrying.** A storage failure, a malformed event,
   anything — caught inside the subscriber, logged, recorded as a diagnostics failure,
   never rethrown. No retry exists anywhere in this platform.
4. **Reuse, never duplicate.** Trace Context is diagnostics' `TraceContext`, reused
   verbatim. Logging/timing/metrics are fresh instances of diagnostics' own factories.
5. **Storage is abstracted from day one**, not bolted on later — every other component
   (`subscriber/`, `query/`) is written only against `assertValidAuditStore()`'s contract.

## 6. Proposed architecture

```
js/services/audit/
  index.js                  public barrel + a constructed-but-not-started `auditSubscriber`
  registry/
    auditRegistry.js          AUDIT_RECORD_VERSIONS, isAuditedEventType(), getAuditRecordVersion(), listAuditedEventTypes()
  contracts/
    auditRecord.js            createAuditRecord(), assertValidAuditRecord() -- the 10-field envelope
  store/
    auditStore.js              assertValidAuditStore(), createInMemoryAuditStore() -- unbounded, append-only
  query/
    auditQueryApi.js           createAuditQueryApi(store) -- byAuditId/byAggregate/byEventType/byTimeRange/byTraceId
  subscriber/
    auditSubscriber.js         createAuditSubscriber() -- the ALL_EVENTS subscriber, self-protected
  shared/
    freezeDeep.js, generateId.js   self-contained primitives, see §4
  audit.test.html
```

## 7. Storage abstraction and the immutability/memory-safety tension

The brief states two requirements that are, for an in-memory implementation over a very
long session, in real tension: "Audit records must never be... deleted... append-only"
(a hard requirement, stated with "must") versus "memory safe" (a design goal, §"Performance").
Diagnostics' `ExecutionTimeline` and the Job Engine's own run history both resolve an
analogous tension by capping their buffers and silently dropping the oldest entries —
correct for their purpose (operational telemetry, not a historical record), wrong for
Audit, where dropping an old record is indistinguishable from deleting it.

This design resolves the tension honestly rather than silently: `createInMemoryAuditStore()`
is genuinely unbounded — it never evicts. This is disclosed, not hidden, as a real
limitation of the *reference implementation specifically* (report doc §"Known
Limitations"), not of the platform's architecture — the storage layer exists as its own
abstraction (`assertValidAuditStore`) precisely so a future milestone can swap in a real,
persistent store (e.g. a dedicated Postgres audit table via its own RPC — a schema
change this milestone does not authorize) without any change to `subscriber/` or
`query/`, both of which are written only against the contract, never the in-memory
implementation's internals.

## 8. Deliberately not started anywhere

Importing `audit/index.js` has no observable effect — `auditSubscriber` is constructed
(a plain object, no subscription yet) but `.start()` is never called by this milestone.
No HTML page, bootstrap script, or business file was touched. This mirrors 11A's and
11C's own precedent exactly: this milestone's brief, unlike 11D's, gives no "register
during application initialization" instruction, so none was added. Starting real
observation is left to a future milestone.

## 9. The Audit Registry as a deliberate opt-in gate

Every event type currently in `events/registry/eventTypes.js` (15, as of this milestone)
has a corresponding entry in `registry/auditRegistry.js`. A future event type is **not**
audited automatically the moment it is added to the Event Bus's own registry — it must be
deliberately added to the Audit Registry too. This is a considered design choice, not an
oversight: an audit trail that silently starts covering new event types with no explicit
decision to include them is a weaker guarantee than one where every audited fact was
consciously opted in. `subscriber/auditSubscriber.js` handles an unregistered event type
gracefully — logs a warning via diagnostics, creates no record, never throws — rather
than crashing or blocking the ERP.

## 10. The Audit Record Contract

Exactly the ten fields the brief names:

```
auditId        unique per audit record (crypto.randomUUID())
eventId        the observed DomainEvent's own id
eventType      e.g. "PurchaseCreated"
aggregate      e.g. "purchase"
aggregateId    identifies which instance
timestamp      ISO-8601, when THIS audit record was created
traceContext   diagnostics' derived TraceContext (Trace Context reused, §11)
metadata       the event's own, raw, publisher-supplied metadata, unchanged
payload        the event's own payload, unchanged
version        this audit record's own schema version, from the registry (§9)
```

`metadata` and `traceContext` are both present deliberately, not redundantly: `metadata`
is exactly what the publishing business code supplied to `eventBus.publish()`;
`traceContext` is diagnostics' own enriched derivation of it (adds a generated
`correlationId` when the publisher didn't supply one). Keeping both preserves "what was
submitted" and "how it was correlated" as separate, honest facts.

## 11. Trace integration — reused, not duplicated

There is no `auditTraceContext.js` or any second context system anywhere in this
platform. `subscriber/auditSubscriber.js` calls `deriveTraceContextFromEvent(event)` —
the exact function `diagnostics/observer/eventObserver.js` (11C) and
`jobs/dispatcher/jobDispatcher.js` (11D) already call for the same purpose. "Reuse the
existing Trace Context. Do NOT create another context system" is satisfied by there being
zero new context code, not by a compatible-but-separate implementation.

## 12. Diagnostics integration — detail

`createAuditSubscriber()` accepts optional `logger`/`timeline`/`metrics`, defaulting to
fresh instances of `diagnostics/`'s own factories, scoped to this one subscriber — the
identical pattern `createJobDispatcher()` (11D) already established. Per observed event:
one `TimelineEntry` (`audit:<eventType>`, success/failure/duration), a structured log
line (bound to the event's derived `TraceContext`) at `debug`/`info`/`warn`/`error`, and
one metrics sample bucketed by event type. None of this duplicates diagnostics' own
aggregation, classification, or logging code — it is instantiation and direct function
calls only, exactly like 11D's own diagnostics integration.

## 13. Error handling

An audit failure — a broken store, a malformed event, anything — is caught inside
`subscriber/auditSubscriber.js`'s `onEvent()`, classified via
`diagnostics/errors/errorClassifier.js`'s `describeError()`, logged, and **never
rethrown**. No retry logic exists anywhere in this platform (confirmed by grep for
`retry`/`attempt` returning nothing beyond this design doc's own prose). A failing audit
observation never blocks, rolls back, modifies, or retries the ERP operation that
published the triggering event — the brief's own "Error Handling" section, satisfied
identically to how 11C and 11D already satisfy the same requirement for their own
subscribers.

## 14. Risks

- **A future caller assumes the in-memory store persists across page reloads.** It does
  not — same disclosed limitation as every other in-memory platform state in this
  multi-page application (Diagnostics' timeline, the Job Engine's run history). Mitigated
  by explicit documentation here and in the report doc.
- **A future event type is published but never added to the Audit Registry, silently
  leaving a gap in the audit trail.** Mitigated by the subscriber's own warning-level log
  line (§9) — the gap is visible in diagnostics output, not silent.
- **Someone assumes the unbounded in-memory store is safe for very high event volumes
  over a very long session.** Mitigated by §7's explicit disclosure and the storage
  abstraction that exists specifically to let this be swapped out.

## 15. Alternatives considered

- **Route Audit through the Job Engine as just another registered job.** Rejected
  outright by the brief; also architecturally wrong — a job's failure isolation and
  lifecycle model exist to protect *business-adjacent* infrastructure work, and adding an
  intermediary would make Audit's own correctness depend on a second subscription layer
  for no benefit (§4).
- **Give Audit its own logger/timer instead of reusing diagnostics' factories.**
  Rejected — directly contradicts "do not duplicate logging," and 11D's own precedent
  already proved fresh-instance reuse is sufficient.
- **Cap the in-memory store the same way Diagnostics/Jobs cap theirs.** Rejected — would
  silently violate the brief's explicit "never deleted... append-only" requirement; the
  tension is real and is resolved by the storage abstraction (§7), not by quietly
  evicting records.
- **Audit only a subset of event types by default, requiring explicit registration.**
  This is what was actually built (§9) — considered and adopted, not rejected, since it
  gives "avoid string literals" real enforcement teeth rather than being decorative.

## 16. Extension points for a future Plugin Framework and Analytics

- **A future Plugin Framework**: consumes the Audit Query API (`createAuditQueryApi`)
  directly, or subscribes to `ALL_EVENTS` independently the way Audit itself does — no
  plugin-specific mechanism needed anywhere in this platform.
- **Future Analytics**: reads audit records via the Query API (`byAggregate`,
  `byEventType`, `byTimeRange`) rather than re-observing the Event Bus itself, since the
  Audit Platform is already the durable historical record analytics would otherwise have
  to reconstruct independently.
- **A real persistent store**: implement `assertValidAuditStore()`'s contract against it;
  no change to `subscriber/` or `query/`.

## 17. Final recommendation

Build exactly the module described in §6, start nothing, touch no existing file, and hand
the finished, tested, documented platform to whichever milestone consumes it next (a
Plugin Framework, Analytics, or real persistence). `docs/audit-platform-architecture.md`
§11 gives them enough to start without re-deriving any decision made here.
