# Domain Event Bus — Architecture Reference

This is the permanent architectural reference for `js/services/events/`, written for
whoever maintains or extends this module next. It describes the system **as it stands
today**, organized by concept, not by milestone. It does not repeat the rationale already
recorded in the milestone docs — consult those when you need the "why" behind a specific
decision:

- `docs/milestone-11a-event-bus-design.md` — full design rationale, alternatives
  considered, key design questions answered
- `docs/milestone-11a-event-bus-report.md` — what was actually built and verified

## 1. What this module is

The Domain Event Bus is ApnaBill's internal, in-process, synchronous notification
infrastructure. It lets one part of the application announce that a business fact just
became true (`"PurchaseCreated"`), and lets any number of other parts react to that fact,
without the part announcing it knowing or caring who (if anyone) is listening.

It is **not**:
- a message queue, not Kafka, not RabbitMQ, not WebSockets — no external system, no
  network hop, no persistence;
- a way to trigger business logic — subscribers react to facts, they never cause the
  fact itself (§5);
- background job infrastructure, an audit log, or a diagnostics system — those are
  11B/11D/11C, each a consumer of this bus, not part of it.

It lives entirely under `js/services/events/`, is a sibling of
`js/services/dataExchange/` (not nested inside it — see design doc §4 for why), and as of
this writing has zero call sites anywhere else in the application (§7).

## 2. Module map and dependency direction

```
shared/                    <- no internal deps (self-contained; deliberately not
  freezeDeep.js               imported from dataExchange/shared/ -- see design doc §4)
  logging/
    logger.js, consoleSink.js, memorySink.js, index.js
  ↑
contracts/                 <- shared/freezeDeep
  eventEnvelope.js
  ↑
registry/                  <- shared/freezeDeep
  eventTypes.js
  ↑
context/                   <- no internal deps
  eventContext.js
  ↑
bus/                        <- registry/eventTypes, contracts/eventEnvelope,
  eventBus.js                  context/eventContext, shared/logging
  ↑
index.js                    <- re-exports everything above; constructs the
                                shared `eventBus` singleton
```

Every arrow points from a more specific layer to a more generic one below it — the same
convention `data-exchange-architecture.md` §3 documents for that platform. `bus/` is the
only file that imports from every other layer; nothing imports "up" from `bus/` into
`registry/`, `contracts/`, or `context/`.

## 3. Public API (`js/services/events/index.js`)

Every consumer imports from this one barrel — never reaches into a subfolder directly:

```js
import { eventBus, EVENT_TYPES, ALL_EVENTS, createEventBus, createEventContext } from '<path>/services/events/index.js';
```

| Export | Kind | Purpose |
|---|---|---|
| `eventBus` | instance | The one shared, application-wide bus. Real call sites use this. |
| `createEventBus({ logger? })` | factory | An isolated bus instance — for tests, or any deliberately separate subscriber set. |
| `EVENT_TYPES` | constant map | `EVENT_TYPES.PURCHASE_CREATED === 'PurchaseCreated'`, etc. — always import the constant, never write the string. |
| `AGGREGATES` | constant array | Every valid `aggregate` value an event contract may declare. |
| `getEventContract(type)` / `isKnownEventType(type)` / `listEventTypes()` | functions | Registry lookups. |
| `ALL_EVENTS` | symbol | Pass to `subscribe()`/`unsubscribe()` to observe every event type. |
| `createDomainEvent(type, details)` / `assertValidDomainEvent(event)` | functions | Envelope construction/validation, normally reached indirectly via `eventBus.publish()`. |
| `createEventContext(overrides)` | function | Builds a whitelisted metadata object; normally passed as `publish()`'s `context` option. |
| `createLogger` / `createConsoleSink` / `createMemorySink` | functions | The sink-injectable logging abstraction `bus/eventBus.js` uses internally; exported for anyone building a custom logger (e.g. a future audit sink). |

### `eventBus`'s four methods

```js
eventBus.publish(EVENT_TYPES.SALE_CREATED, { aggregateId: sale.id, payload: {...}, context: {...} });
// -> { event: DomainEvent, errors: Array<{handler, error}> }

const unsubscribe = eventBus.subscribe(EVENT_TYPES.SALE_CREATED, (event) => { ... });
// or: eventBus.subscribe(ALL_EVENTS, (event) => { ... });

eventBus.unsubscribe(EVENT_TYPES.SALE_CREATED, handlerFn);  // -> boolean
eventBus.subscriberCountFor(EVENT_TYPES.SALE_CREATED);       // -> number
```

## 4. The event envelope

Every `DomainEvent` this bus ever dispatches has exactly these fields, deep-frozen:

```
id            unique per event instance (crypto.randomUUID(), with a non-crypto fallback)
type          e.g. "PurchaseCreated" -- always one of EVENT_TYPES's values
timestamp     ISO-8601, set at creation
aggregate     e.g. "purchase" -- always from the registry, never caller-supplied
aggregateId   identifies which purchase/sale/item/etc. this event is about
version       the payload contract version for this event type, from the registry
payload       event-type-specific business facts (open shape, not schema-validated yet)
metadata      optional context (user/company/requestId/source/module/executionId/traceId)
```

`aggregate` and `version` always come from `registry/eventTypes.js`'s contract for that
type — a caller cannot override them, which is what keeps the registry authoritative.

## 5. Publishing rules (permanent, do not relax)

Events are emitted **after** a business operation already succeeded. They are pure
notifications. No subscriber may cause the original operation to depend on it — the
forbidden inverse (an event *triggering* the save it's supposed to be reporting) is
architecture, not a bug, and must never be introduced. See design doc §14 for the full
rationale and the canonical example.

## 6. Error handling / subscriber isolation

- Every handler runs inside `dispatch()`'s own `try/catch`.
- A synchronous throw: logged (`error` level, includes event type, handler name, error
  message) via the bus's injected logger, recorded in `publish()`'s returned `errors`
  array, and the remaining subscribers still run.
- An async handler's rejected promise: caught via `.catch()` and logged the same way,
  without `publish()` ever awaiting it — `publish()` stays synchronous regardless of what
  any subscriber does internally.
- `publish()` itself only throws for a programmer error at the call site (unregistered
  event type, missing `aggregateId`, non-function handler) — never because of what a
  subscriber did.

Full rationale: design doc §12.

## 7. Current call sites

As of Milestone 11B, every event type in the registry except `PurchaseDeleted`,
`SaleCancelled`, and `ManufacturingStarted` is wired to a real publish site (those three
have no corresponding implementation anywhere in the app to hook — see
`docs/milestone-11b-event-integration-report.md` §"Registry gaps left unwired" for why).
Still **zero subscribers** exist anywhere — publishing only, per 11B's brief; the first
real subscriber arrives with 11B/11C/11D/11E's consumers.

| Event | File | Function |
|---|---|---|
| `CompanyChanged` | `js/supabaseClient.js` | `setActiveCompany(id)` (only when `id` is truthy) |
| `CustomerCreated` | `js/sales.js` | `createPartyQuick()` (shared by UI + both importers) |
| `SupplierCreated` | `js/suppliers.js` | `createSupplier()` (shared by UI + both importers) |
| `ItemCreated` | `js/items.js` | `createItem()` (shared by UI + both importers) |
| `PurchaseCreated` | `js/purchases.js` | `savePurchaseFromCart()` |
| `SaleCreated` | `js/sales.js` | `saveSaleFromCart()` (shared by UI + both importers) |
| `ManufacturingCompleted` | `js/manufacturing.js` | `createManufacturing()` (one atomic RPC — see report for why `Started` is not also published) |
| `StockAdjusted` | `js/items.js` | `recordStockAdjustment()` |
| `ImportCompleted` | `js/services/dataExchange/xml/xmlImporter.js`, `.../json/import/jsonImporter.js` | `createXmlImporter().run()`, `createJsonImporter().run()` (gated on `historyEntry.isSuccess()`) |
| `ExportCompleted` | `js/services/dataExchange/xml/export/xmlExporter.js`, `.../json/export/jsonExporter.js` | `runXmlExport()`, `runJsonExport()` (gated on `historyEntry.isSuccess()`) |
| `BackupCreated` | `js/services/dataExchange/apnabill/apnabillBackup.js` | `runApnaBillBackup()` (gated on `historyEntry.isSuccess()`) |
| `RestoreCompleted` | `js/services/dataExchange/apnabill/apnabillRestore.js` | `runApnaBillRestore()` (gated on `historyEntry.isSuccess()`; event type added in 11B) |

Every wired call site publishes strictly **after** the existing success point (a
synchronous throw-on-error for the Core ERP functions; a `historyEntry.isSuccess()` gate
for the six Data Exchange orchestration entry points, which normalize failures instead of
throwing) and changes no existing return shape, parameter, or behavior. Full rationale,
payload philosophy, and every gap left deliberately unwired: see
`docs/milestone-11b-event-integration-report.md`.

## 8. How to extend this module

**Add a new event type**: add one entry to `EVENT_CONTRACTS` in
`registry/eventTypes.js` (`type` in PascalCase `<Aggregate><PastTenseFact>` form,
a declared `aggregate` from `AGGREGATES`, a `version`, a `description`), then re-export
its constant from `events/index.js` if you added a new key. Nothing in `bus/eventBus.js`
needs to change — `publish()`/`subscribe()` pick up new registry entries automatically.

**Add a new aggregate**: add its name to `AGGREGATES` in `registry/eventTypes.js` before
any contract references it (a startup-time check in that file throws if a contract
references an undeclared aggregate).

**Subscribe from a new module**: `import { eventBus, EVENT_TYPES } from
'.../services/events/index.js'; eventBus.subscribe(EVENT_TYPES.X, handler);`. Use
`ALL_EVENTS` instead of a specific type for a cross-cutting subscriber (Diagnostics,
Audit) that needs to see everything without maintaining its own list of event types.

**Wire a real publish() call into business code**: see §7 — identify the function's
single success-path return point, decide the `payload` shape for that event type,
call `eventBus.publish(EVENT_TYPES.X, { aggregateId, payload })` immediately before
returning. This is additive to the business function (one line) and does not change its
existing behavior, return shape, or error handling.

## 9. Future milestones

- **11C Diagnostics** — done. `js/services/diagnostics/` is exactly the `ALL_EVENTS`
  subscriber this section originally anticipated — see `docs/diagnostics-architecture.md`.
  Its own observer is constructed but not started (deliberate; see that doc §10) — no
  live subscriber exists yet.
- **11D Background Job Engine** — done. `js/services/jobs/` subscribes to specific event
  types (per job's declared `triggerEvents`) to dispatch non-blocking infrastructure
  work, reusing `diagnostics/`'s `createExecutionTimeline()`/`createMetricsRecorder()`
  for its own timing — see `docs/job-engine-architecture.md`. Unlike 11C's observer, this
  one **is live**: wired into 7 real pages' own startup flow.
- **11E Audit Platform** — done. `js/services/audit/` is exactly the `ALL_EVENTS`
  subscriber this section anticipated — a peer of Diagnostics and the Job Engine, never
  routed through either. See `docs/audit-platform-architecture.md`. Its own subscriber is
  constructed but not started (deliberate, same precedent as 11C's observer) — no live
  subscriber exists yet.
- **11F Plugin & Extension Framework** — done. `js/services/extensions/` lets a real
  extension register as an ordinary Event Bus subscriber (through its own
  `ExtensionContext`, never directly); per-subscriber isolation (§6) is already
  guaranteed by this module and extended with per-hook isolation of its own — see
  `docs/extension-framework-architecture.md`. This closes the approved infrastructure
  roadmap (11A–11F); nothing beyond 11F is planned.
- **Real event-emission wiring** — done in Milestone 11B (§7). Three registry entries
  remain unpublished (`PurchaseDeleted`, `SaleCancelled`, `ManufacturingStarted`) because
  no corresponding implementation exists anywhere in the app yet; wire them if/when that
  code is ever written.
- **Per-event-type payload schemas** — payloads are currently informal (see the 11B
  report's "Payload philosophy"); formalizing them is only worth doing once a real
  subscriber needs to depend on a stable shape.
