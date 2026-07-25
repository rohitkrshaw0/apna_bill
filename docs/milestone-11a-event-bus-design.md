# Milestone 11A — Domain Event Bus: Architecture Design

## 1. Goals

Build the internal Domain Event Bus: a lightweight, synchronous, in-process notification
mechanism that lets future milestones (11B Background Jobs, 11C Diagnostics, 11D Audit,
11E Plugin System) react to business facts as they happen, without any of those future
milestones needing to touch the modules that produce those facts.

This is an infrastructure milestone. It adds one new, self-contained module
(`js/services/events/`) and touches nothing else. It does not add any event-emission
call to any existing business function — see §15 for why that's a deliberate scope
boundary, not an oversight.

## 2. Current architecture (as it exists today)

Grepping `js/` for `EventBus`, `publish(`, `subscribe(`, `dispatchEvent`, `CustomEvent`,
and `pubsub` finds nothing under `js/services/` — there is no domain event infrastructure
anywhere in this codebase today. The only `addEventListener` usage in the tree is ordinary
DOM event wiring in `js/ui/*.js` (buttons, form fields, table rows), unrelated to domain
events.

The one piece of prior art worth citing is
`js/services/dataExchange/progress/progressTracker.js`, whose own comment calls it "state
+ a tiny pub-sub future screens can subscribe to":

```js
const listeners = [];
function update (partial) {
  state = { ...state, ...partial };
  const event = snapshot();
  for (const listener of listeners) listener(event);
  return event;
}
return {
  update, /* ... */
  on: (handler) => { listeners.push(handler); },
  off: (handler) => { const i = listeners.indexOf(handler); if (i >= 0) listeners.splice(i, 1); }
};
```

This is scoped to exactly one topic (progress of one migration run currently executing)
and instantiated fresh per run via `createProgressTracker()` — it is not a shared,
application-wide bus, has no event registry, no typed envelope, no multi-topic
subscription, and no documented error-isolation strategy. It confirms two things: (a)
this codebase already leans toward a plain `on`/`off`/notify-listeners shape rather than
DOM `EventTarget` semantics when it wants pub-sub, which this design follows for
consistency; and (b) nothing needs to be de-duplicated — the Domain Event Bus is new
ground.

Business save flows (`js/purchases.js`'s `savePurchaseFromCart`, `js/sales.js`'s
`saveSaleFromCart`, and equivalents for customers/suppliers/items/manufacturing/stock)
each build a payload, call a Supabase RPC, throw on error, and return the result. None of
them currently notify anything after a successful save.

## 3. Non-goals (explicit)

Per the milestone brief, this is the foundation only. Not built here: background jobs,
audit logs, diagnostics, analytics, notifications, WebSockets, a sync engine, or cloud
messaging. Not built here either: any wiring of `publish()` into an existing business
function (§15).

## 4. Key design questions answered

**Where does this module live?** `js/services/events/`, a sibling of
`js/services/dataExchange/`, not a child of it. The event bus must be usable by every
business module (customers, suppliers, items, purchases, sales, manufacturing, stock,
company) as well as the Data Exchange Platform itself (`ImportCompleted`/
`ExportCompleted`/`BackupCreated`) — nesting it inside `dataExchange/` would make a
platform-neutral primitive depend on one specific platform's location.

**Class or factory?** Factory functions returning object literals of closures
(`createEventBus()`, `createLogger()`), matching every existing service in this codebase
(`createMigrationEngine()`, `createValidationPipeline()`, etc.). Zero `class` usage,
consistent with the rest of `js/services/`.

**Does the bus own its own logging/freeze primitives, or import
`dataExchange/shared/`?** It owns its own copies (`events/shared/freezeDeep.js`,
`events/shared/logging/`). `events/` is meant to be a dependency of `dataExchange/`
eventually (Data Exchange will want to publish `ImportCompleted` etc. in a later
milestone), never the reverse — importing from `dataExchange/shared/` today would be a
platform reaching sideways into another platform's internals for a two-line utility, the
same "deliberate architectural exception" class of decision Milestone 10's `crc32.js`
import was, but with no comparable justification here (this one costs nothing to avoid).

**Should `publish()` be async?** No. The brief is explicit: "deterministic, synchronous."
`publish()` calls every handler synchronously, in order, and returns synchronously. See
§12 for what happens when a handler itself is async.

**Should the registry allow ad hoc, unregistered event types?** No. `publish()` and
`subscribe()` both throw `TypeError` for any event type not in
`registry/eventTypes.js`. This is what makes "avoid string literals throughout the
application" enforceable rather than aspirational — a typo'd event type fails loudly at
the call site instead of silently going nowhere.

## 5. Design principles

1. **Notification, not orchestration.** Events are emitted after a business operation
   already succeeded. No subscriber can influence, delay, or fail that operation (see
   §14, and the milestone brief's explicit example of the forbidden inverse).
2. **One source of truth per concern.** One place for the envelope shape
   (`contracts/eventEnvelope.js`), one place for the catalog
   (`registry/eventTypes.js`), one shared bus instance (`index.js`'s `eventBus`).
3. **Isolated subscribers.** A broken subscriber is a subscriber's problem, never the
   bus's, never the publisher's, and never another subscriber's (§13).
4. **Additive extension.** A new event type is one new entry in one file. A new
   subscriber is one `bus.subscribe()` call. Neither requires touching `bus/eventBus.js`.
5. **Zero coupling to what isn't built yet.** No job queue, no persistence, no retry
   policy, no audit trail — those are 11B/11C/11D's job, built *on* this, not folded into
   it.

## 6. Proposed architecture

```
js/services/events/
  index.js                 public barrel + the shared `eventBus` singleton
  contracts/
    eventEnvelope.js        createDomainEvent(), assertValidDomainEvent(), DomainEvent shape
  registry/
    eventTypes.js            EVENT_TYPES, AGGREGATES, getEventContract(), isKnownEventType(), listEventTypes()
  context/
    eventContext.js          createEventContext() -- optional metadata whitelist
  bus/
    eventBus.js               createEventBus(), ALL_EVENTS
  shared/
    freezeDeep.js             self-contained copy, see §4
    logging/
      logger.js, consoleSink.js, memorySink.js, index.js   self-contained copy, see §4
  eventBus.test.html
```

## 7. Component diagram

```
                     ┌─────────────────────────┐
  business code  --->│  eventBus.publish(type,  │---> logger (subscriber errors only)
  (future, NOT       │    {aggregateId,payload, │
  wired this          │    context})            │
  milestone)          └───────────┬─────────────┘
                                   │  looks up contract in
                                   ▼
                     ┌─────────────────────────┐
                     │  registry/eventTypes.js  │  (single source of truth:
                     │  EVENT_TYPES, contracts  │   aggregate + version per type)
                     └───────────┬─────────────┘
                                   │  stamps
                                   ▼
                     ┌─────────────────────────┐
                     │ contracts/eventEnvelope  │  createDomainEvent() -> frozen DomainEvent
                     │   + context/eventContext │
                     └───────────┬─────────────┘
                                   │  dispatched to
                       ┌───────────┴───────────┐
                       ▼                        ▼
             specific-type subscribers   ALL_EVENTS subscribers
             (subscribe() order)          (subscribe() order, run after)
                       │                        │
              each wrapped in its own try/catch -- one throwing handler
              never stops the rest or reaches the publisher (§13)
```

## 8. Interfaces

Illustrative shapes — implemented exactly as shown, JSDoc-typed since this codebase has
no TypeScript compiler:

```js
/**
 * @typedef {object} DomainEvent
 * @property {string} id             unique per event instance
 * @property {string} type           PascalCase "<Aggregate><PastTenseFact>"
 * @property {string} timestamp      ISO-8601
 * @property {string} aggregate      domain aggregate, from the registry
 * @property {*} aggregateId         which instance of that aggregate
 * @property {number} version        payload contract version, from the registry
 * @property {object} payload        event-type-specific business facts
 * @property {object} metadata       optional context, always present as an object
 */

/**
 * @typedef {object} EventContract
 * @property {string} type
 * @property {string} aggregate
 * @property {number} version
 * @property {string} description
 */

/** @typedef {(event: DomainEvent) => void|Promise<void>} EventHandler */
```

`createEventBus({ logger? })` returns:

```js
{
  publish (eventType, { aggregateId, payload?, context? }) -> { event: DomainEvent, errors: Array<{handler, error}> },
  subscribe (eventType|ALL_EVENTS, handler: EventHandler) -> unsubscribeFn,
  unsubscribe (eventType|ALL_EVENTS, handler) -> boolean,
  subscriberCountFor (eventType|ALL_EVENTS) -> number,
  clear () -> void
}
```

## 9. Data flow / lifecycle

```
savePurchaseFromCart()                              (future milestone's wiring, not built here)
  │
  ▼
purchase row created in DB, function about to return
  │
  ▼
eventBus.publish(EVENT_TYPES.PURCHASE_CREATED, { aggregateId: purchase.id, payload: {...} })
  │
  ├── registry lookup: aggregate = 'purchase', version = 1
  ├── createDomainEvent(): stamps id/timestamp, freezes the envelope
  │
  ▼
dispatch, in order:
  1. subscribers registered for 'PurchaseCreated' (subscribe() order)
  2. subscribers registered for ALL_EVENTS (subscribe() order)
     -- each handler: try/catch (+ .catch() if it returns a thenable);
        a failure is logged and skipped, never re-thrown
  │
  ▼
publish() returns { event, errors } -- errors is [] on the happy path;
the calling code (savePurchaseFromCart) does not need to inspect it and
its own return value/behavior is completely unaffected either way
```

## 10. Event naming convention (permanent)

- **JS constant identifiers**: `SCREAMING_SNAKE_CASE` (`EVENT_TYPES.PURCHASE_CREATED`),
  matching every other enum-like constant already in this codebase (`EXECUTION_MODES`,
  `ENTITY_TYPES`, `HISTORY_STATUS`).
- **Event type string values**: PascalCase, `<Aggregate><PastTenseFact>`
  (`"PurchaseCreated"`, `"SaleCancelled"`, `"StockAdjusted"`). Never camelCase,
  kebab-case, or snake_case.
- **Facts, never commands.** `"PurchaseCreated"`, never `"CreatePurchase"`. The command
  already happened in whatever function calls `publish()` — the event only announces that
  it succeeded.
- These two rules are permanent and enforced by the `eventBus.test.html` regex checks
  against every registered type (§ Interfaces in the report doc) — any future addition
  that violates either fails the suite immediately.

## 11. Event registry

`registry/eventTypes.js` is the one place event type strings are written down.
`EVENT_TYPES` maps a constant identifier to its string value; `getEventContract()`,
`isKnownEventType()`, and `listEventTypes()` are the only sanctioned ways to look up or
enumerate the catalog. `publish()`/`subscribe()` both call `isKnownEventType()`
internally and throw for anything not registered — this is what keeps "avoid string
literals throughout the application" enforceable rather than a style guideline nobody
checks. Adding `PurchaseUpdated` in a future milestone means adding one entry to
`EVENT_CONTRACTS` and one line to `events/index.js`'s re-export list; nothing in
`bus/eventBus.js` changes.

## 12. Subscriber layer and error handling strategy (documented, as required)

Every subscriber runs inside `bus/eventBus.js`'s `dispatch()`, wrapped individually:

- **Synchronous throw**: caught, logged via the injected logger at `error` level with the
  event type, subscriber name (or `'(anonymous)'`), and error message; recorded in the
  `errors` array `publish()` returns; the next subscriber still runs.
- **Asynchronous rejection** (handler returns a Promise that later rejects): the bus
  attaches a `.catch()` to the returned thenable so the rejection is still logged the same
  way — but `publish()` does not `await` it, so a slow or failing async subscriber can
  never delay or corrupt the synchronous publish cycle. This is a deliberate middle
  ground: the bus stays synchronous end-to-end (per the brief), while still not leaving
  async subscriber failures completely silent.
- **No re-throw, ever.** `publish()` cannot throw because a subscriber misbehaved. The
  only things that make `publish()`/`subscribe()` throw are programmer errors at the call
  site itself: an unregistered event type, a missing `aggregateId`, or a non-function
  handler — all caught immediately in development, never dependent on which subscribers
  happen to be registered at runtime.
- **Immutable events** remove one entire class of cross-subscriber corruption: no
  subscriber can mutate the event object and affect what a later subscriber (or the
  publisher) sees, because `createDomainEvent()` deep-freezes the envelope before
  dispatch.

## 13. Event context

`context/eventContext.js`'s `createEventContext()` accepts an explicit whitelist —
`user`, `company`, `requestId`, `source`, `module`, `executionId`, and a reserved
`traceId` for future distributed tracing — and copies through only the keys actually
provided. No event is ever required to carry any of these; `publish()` always produces a
`metadata` object, empty or populated, never `undefined`. Unrecognized keys passed in
`context` are silently dropped rather than merged, so `metadata` can never become an
uncontrolled grab-bag that future Audit (11D) would have to defensively parse.

## 14. Publishing rules — the architectural boundary that must never move

Events are emitted **after** a business operation already succeeded, and are pure
notifications. The bus is not replacing direct function calls, and no future subscriber
may call back into business logic in a way that makes the original operation depend on a
subscriber succeeding. The brief's example is the permanent contract:

```
savePurchase() -> purchase saved -> PurchaseCreated published -> future subscribers react
```

The inverse — `PurchaseCreated` *triggering* `savePurchase()` — is forbidden
architecture, permanently, not just for this milestone.

## 15. Wiring plan — deliberately deferred, not an oversight

This milestone does not add a single `eventBus.publish()` call to any existing business
file (`js/purchases.js`, `js/sales.js`, `js/items.js`, etc.). Two independent reasons:

1. The brief's "DO NOT" list explicitly forbids changing services, workflows, and
   Core ERP files — `savePurchaseFromCart`/`saveSaleFromCart` are exactly that.
2. Wiring correctly needs a decision this milestone has no mandate to make on its own:
   *which* fields belong in each event's `payload` for each of the fourteen catalog
   entries. That's a per-aggregate design conversation, not an infrastructure one.

The hook point already exists and needs no further investigation when that milestone
happens: both `savePurchaseFromCart` (`js/purchases.js`) and `saveSaleFromCart`
(`js/sales.js`) funnel every caller — UI pages and the XML/JSON import pipelines alike —
through one `if (error) throw error; return { ...data, totals };` choke point. A future
milestone adds one `eventBus.publish(EVENT_TYPES.PURCHASE_CREATED, { aggregateId:
data.id, payload: {...} })` call immediately before that `return`, in each such function,
once, and every current and future subscriber sees it — no call site needs to change.

## 16. Extension guidelines for 11B–11E

- **11B Background Jobs**: subscribe to whichever specific event types should enqueue
  work (e.g. `ExportCompleted` → "email the file"). Use `bus.subscribe(type, handler)`;
  a job handler that itself needs to run async work should return a Promise so its
  rejection is still captured (§12).
- **11C Diagnostics**: subscribe to `ALL_EVENTS` to build a live event stream/counter
  without maintaining its own list of every event type as the catalog grows.
- **11D Audit**: also a natural `ALL_EVENTS` subscriber — persist `event.id`,
  `event.type`, `event.aggregate`, `event.aggregateId`, `event.timestamp`, and
  `event.metadata` as an audit row per event. `createMemorySink`/`createConsoleSink`'s
  sink-injection pattern (§4) is the template for a future "audit sink" the logger-style
  abstraction can take without changing the bus.
- **11E Plugin System**: a plugin registers as an ordinary subscriber (specific type or
  `ALL_EVENTS`); plugin sandboxing/isolation is 11E's own concern layered on top of the
  per-subscriber try/catch this milestone already guarantees (§12) — 11E does not need to
  reinvent isolation, only decide what a misbehaving plugin should additionally trigger
  (e.g. auto-disable).
- **Any future business module**: publish only after success, only through
  `EVENT_TYPES.*` constants, and register any brand-new event type in
  `registry/eventTypes.js` first — never invent a string literal at the call site.

## 17. Risks

- **A future call site imports the wrong logger sink and floods the console.** Mitigated
  by defaulting to `createConsoleSink()` (matches the rest of the codebase's default) and
  documenting `createMemorySink()` for tests explicitly.
- **A future milestone is tempted to make `publish()` async "just this once" for one
  subscriber's convenience.** Mitigated by this document stating plainly (§4, §14) that
  synchronous-only is a permanent architectural decision, not a v1 limitation.
- **Event payload shapes drift once wiring begins**, since payload is currently
  `{}`-shaped per type with no schema validation. Accepted as out of scope for 11A (no
  aggregate-specific payload knowledge belongs in this milestone); each event's `version`
  field exists specifically so a future payload-shape change can be detected by
  subscribers without this bus needing to change.

## 18. Alternatives considered

- **`EventTarget`/`CustomEvent` (browser-native pub-sub).** Rejected: forces every event
  through `detail`, offers no per-type registry or contract enforcement, and the
  codebase's own prior art (`progressTracker.js`) already established a plain
  `on`/`off`-style closure pattern instead.
- **A single global `Map` of listeners with no registry gate.** Rejected: this is exactly
  what "avoid string literals throughout the application" (brief §4) is meant to prevent
  — nothing would catch a typo'd event type at the call site.
- **Making `publish()` return a `Promise` and awaiting all handlers.** Rejected: directly
  contradicts "synchronous" in the brief's design goals and would make every publish call
  site's timing depend on the slowest currently-registered subscriber — a future
  Diagnostics subscriber doing something slow could silently delay a sale being saved.
- **A class-based `EventBus` with `extends EventEmitter`-style API.** Rejected: no
  `class` usage anywhere in this codebase's service layer; would be the first and only
  exception.

## 19. Final recommendation

Build exactly the module described in §6, wire nothing into existing business code (§15
explains why, precisely, this is correct rather than incomplete), and hand the finished,
tested, documented bus to whichever milestone comes next. §16 gives each of 11B–11E
enough to start without re-deriving any of the decisions made here.
