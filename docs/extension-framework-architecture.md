# Plugin & Extension Framework — Architecture Reference

This is the permanent architectural reference for `js/services/extensions/`, written for
whoever maintains or extends this module next. It describes the system **as it stands
today**, organized by concept, not by milestone. It does not repeat the rationale already
recorded in the milestone docs — consult those when you need the "why" behind a specific
decision:

- `docs/milestone-11f-extension-framework-design.md` — full design rationale,
  alternatives considered, the Job Dispatcher access tension
- `docs/milestone-11f-extension-framework-report.md` — what was actually built and
  verified

## 1. What this platform is

The Plugin & Extension Framework is the generic infrastructure that lets future
capabilities extend ApnaBill without modifying the core application. It is the fifth and
final infrastructure platform in the approved roadmap
(`docs/architecture/platform-roadmap.md`) — this milestone builds no actual plugin beyond
one required demonstration (`extensions/sampleExtension.js`, exercised only by its own
test suite, never registered in the real application).

It lives entirely under `js/services/extensions/`, is a sibling of `js/services/events/`,
`js/services/diagnostics/`, `js/services/jobs/`, and `js/services/audit/`, and depends on
all four of those platforms' public barrels. It is the only infrastructure platform that
depends on all the others — none of them import anything from `extensions/`:

```
ERP
  ↓
Infrastructure
    ├── Event Bus
    ├── Diagnostics
    ├── Job Engine
    ├── Audit Platform
    └── Extension Framework   <- depends on all four; none depend on it
```

## 2. Module map and dependency direction

```
shared/                    <- no internal deps (self-contained; deliberately not
  freezeDeep.js, semver.js     imported from events/shared/, diagnostics/shared/,
                                jobs/shared/, or audit/shared/)
  ↑
contracts/                  <- shared/
  extensionContract.js
  ↑
validation/                 <- shared/ (semver), contracts/ (dependency shape only)
  dependencyValidator.js
  ↑
registry/                   <- validation/ (extensionRegistry.js only)
  extensionRegistry.js
  capabilityRegistry.js       <- no internal deps
  ↑
context/                    <- events/, diagnostics/, audit/ (createAuditQueryApi only)
  extensionContext.js           -- the only file that imports from those three barrels
  ↑
lifecycle/                  <- events/, diagnostics/, audit/, jobs/, registry/, context/
  extensionLifecycleManager.js  -- the only file that imports from jobs/
  ↑
extensions/                 <- events/ (EVENT_TYPES only), contracts/
  sampleExtension.js            -- the one demonstration extension
  ↑
index.js                    <- re-exports everything above; constructs an empty,
                                unstarted `extensionRuntime`
```

## 3. Public API (`js/services/extensions/index.js`)

```js
import { extensionRuntime, createExtensionLifecycleManager, createExtensionDefinition, LIFECYCLE_STATE } from '<path>/services/extensions/index.js';
```

| Export | Kind | Purpose |
|---|---|---|
| `extensionRuntime` | instance | The one shared, application-wide lifecycle manager. Empty registry, nothing started. |
| `createExtensionLifecycleManager({ registry?, capabilityRegistry?, eventBus?, auditStore?, jobDispatcher?, logger?, logSink? })` | factory | An isolated manager — for tests, or a deliberately separate instance. |
| `createExtensionDefinition(fields)` / `assertValidExtensionDefinition(def)` | functions | Contract construction/validation (§4). |
| `createExtensionRegistry()` / `createCapabilityRegistry()` | factories | Isolated registries (the lifecycle manager builds its own by default). |
| `validateExtension(definition, registry)` / `detectCircularDependency(...)` / etc. | functions | Dependency validation (§7), also usable standalone. |
| `createExtensionContext(opts)` | function | Builds one extension's controlled infrastructure surface (§6). |
| `LIFECYCLE_STATE` | constant map | The five lifecycle states (§5). |
| `parseVersion` / `compareVersions` / `satisfiesMinVersion` | functions | The minimal semver comparator (§7). |

### `extensionRuntime`'s methods

```js
extensionRuntime.register(definition);      // validates, then registers -- throws on any validation error
extensionRuntime.initialize(id);             // REGISTERED -> INITIALIZED, calls onInitialize
extensionRuntime.start(id);                  // INITIALIZED -> STARTED, calls onStart; requires deps already STARTED
extensionRuntime.stop(id);                   // STARTED -> STOPPED, calls onStop
extensionRuntime.dispose(id);                // INITIALIZED/STARTED/STOPPED -> DISPOSED, calls onDispose
extensionRuntime.unregister(id);             // convenience: stop (if started) + dispose + remove from both registries
extensionRuntime.getState(id);               // -> one of LIFECYCLE_STATE, or null if never registered/already unregistered
extensionRuntime.registry;                   // this manager's own ExtensionRegistry instance
extensionRuntime.capabilityRegistry;         // this manager's own CapabilityRegistry instance
```

## 4. The Extension Contract

```
id             unique, no ad hoc duplicates (enforced at register())
name           human-readable
version        "major.minor.patch" (semver-lite, §7)
description
author
capabilities   string[] -- what this extension PROVIDES (§8)
dependencies   {id, minVersion?}[] -- what this extension REQUIRES (§7, §9)
hooks          {onInitialize?, onStart?, onStop?, onDispose?} -- every hook optional
```

Every `ExtensionDefinition` is deep-frozen by `createExtensionDefinition()` (deep-freeze
skips functions, so `hooks.*` remain callable).

## 5. Lifecycle

Exactly five states: `REGISTERED → INITIALIZED → STARTED → STOPPED → DISPOSED`. Every
transition requires the correct prior state — calling one out of order throws
immediately, before any hook runs. `unregister()` is a convenience over the same five
states, not a sixth phase: it runs `stop()` (only if currently `STARTED`) then
`dispose()` then fully removes the extension from both the Extension Registry and the
Capability Registry.

**Cross-extension ordering**: `start(id)` additionally requires every dependency `id`
declared in `dependencies` to already be `STARTED`. This is enforced at `start()` time,
distinct from (and in addition to) the existence/version checks `register()` already ran
(§7) — a dependency existing and being version-compatible does not mean it has actually
been started yet.

## 6. Extension Context — the controlled surface

```
context.events        subscribe(type, handler) / unsubscribe(type, handler) / publish(type, details) / EVENT_TYPES
context.diagnostics    logger (scoped to `extension.<id>`) / classifyError / describeError
context.audit          query: { byAuditId, byAggregate, byEventType, byTimeRange, byTraceId }  -- READ ONLY
context.jobs           getRunHistory() / isRunning()  -- READ ONLY, no job registration (§9)
context.capabilities   getProviders(name) / hasCapability(name)  -- capability discovery (§8)
```

No field here is a raw ERP module or an unrestricted platform singleton. `context.events`
grants exactly the same capability any other Event Bus subscriber already has (Diagnostics,
the Job Engine, and Audit are all just other subscribers on the same bus) — an extension
cannot register a brand-new event *type* through it, since `events/registry/eventTypes.js`
is a closed catalog this framework must not modify.

## 7. Dependency validation

`validation/dependencyValidator.js`'s `validateExtension(definition, registry)` runs four
checks, all before a definition is ever accepted by `extensionRegistry.register()`:

1. **Duplicate ID** — is `definition.id` already registered?
2. **Missing dependency** — does every entry in `definition.dependencies` resolve to an
   already-registered extension?
3. **Version incompatibility** — for every dependency with a `minVersion`, does the
   registered extension's `version` satisfy it (`shared/semver.js`'s
   `satisfiesMinVersion`, a minimal major.minor.patch comparator — no pre-release/build
   metadata, no ranges beyond a single floor)?
4. **Circular dependency** — would registering this definition create a cycle in the
   dependency graph (DFS over every already-registered extension plus the candidate)?

Any failure produces a `{ code, message }` error; `register()` throws a single `TypeError`
listing every error found, never accepting a partially-valid definition.

## 8. Capability Registry — decoupling, not automatic resolution

An extension declares what it *provides* (`capabilities: string[]`); another extension
discovers who provides something via `context.capabilities.getProviders('name')` instead
of hardcoding a specific extension's id. This registry is deliberately "dumb": it never
enforces a single provider per capability and never picks a "winning" one automatically —
a consumer decides what to do with however many providers exist. See design doc §9 for
why this is a considered choice, not an unfinished feature.

## 9. What Job Dispatcher access does NOT include

`context.jobs` is read-only observation (`getRunHistory`/`isRunning`) — **not** job
registration. `jobs/registry/jobIds.js` is a closed catalog by 11D's own design; this
framework must not modify the Job Engine to loosen it. A future milestone that wants
extension-registered jobs would need to deliberately redesign that catalog — flagged, not
attempted here (design doc §10, §15).

## 10. Error handling and failure isolation

Every hook call — `onInitialize`/`onStart`/`onStop`/`onDispose` — runs inside
`lifecycle/extensionLifecycleManager.js`'s own `safeCall()`: caught, classified via
`diagnostics/errors/errorClassifier.js`, logged, and **never rethrown**. A broken
extension can never crash the Lifecycle Manager, never blocks a sibling extension's own
lifecycle, and never leaves the manager itself unusable afterward.

## 11. Current call sites

**None in production.** `extensionRuntime` (exported from `index.js`) has an empty
registry — no extension is registered anywhere in the real application. The one
demonstration extension (`extensions/sampleExtension.js`) exists solely to validate the
framework and is exercised only by `extensionFramework.test.html`.

## 12. How to extend this platform

**Build a real extension**: call `createExtensionDefinition({...})` with real
`id`/`name`/`version`/`description`/`author`/`capabilities`/`dependencies`/`hooks`, then
`extensionRuntime.register(definition)` (or build an isolated
`createExtensionLifecycleManager()` if it needs its own registry). Nothing under
`extensions/` itself needs to change.

**Consume another extension's capability**: from inside a hook, call
`context.capabilities.getProviders('capability-name')` — never hardcode the providing
extension's id.

**React to a Domain Event**: `context.events.subscribe(EVENT_TYPES.X, handler)` from
`onStart`; unsubscribe the returned function from `onStop`, the same pattern
`extensions/sampleExtension.js` itself uses.

**Add a new capability to the Extension Context** (e.g. a future milestone wants
extensions to see more of some platform): extend `context/extensionContext.js`'s return
object with a new, deliberately scoped field — never widen an existing field into raw
platform access.

## 13. Roadmap status

This milestone closes the approved infrastructure roadmap (`docs/architecture/platform-roadmap.md`).
11A through 11F are all complete. Nothing beyond 11F is speculated on here, in the
milestone docs, or in the roadmap itself — any further infrastructure work is a new,
separately-approved decision, not an extension of this document.
