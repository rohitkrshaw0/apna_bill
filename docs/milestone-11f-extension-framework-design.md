# Milestone 11F — Plugin & Extension Framework: Architecture Design

## 1. Goals

Build the Plugin & Extension Framework: the generic infrastructure that lets future
capabilities extend ApnaBill without modifying the core application. This is the final
infrastructure milestone in the roadmap — it builds no actual plugin, only the reusable
framework every future one will use.

## 2. Current architecture (as it exists today)

Read in full before any code was written: `docs/architecture/platform-roadmap.md`,
`docs/event-bus-architecture.md`, `docs/diagnostics-architecture.md`,
`docs/job-engine-architecture.md`, `docs/audit-platform-architecture.md`. Two facts from
that reading shaped this design directly:

1. **Four independent, sibling infrastructure platforms already exist**, each consuming
   the Event Bus and/or Diagnostics without depending on each other: the Job Engine
   (11D) and Audit Platform (11E) both subscribe to the Event Bus directly and both reuse
   Diagnostics' factories by constructing fresh instances rather than duplicating any
   logic. The Extension Framework is the fifth sibling, following the identical reuse
   pattern for the same reason ("reuse the existing infrastructure," repeated in every
   milestone's brief since 11C).
2. **The roadmap's own diagram already named this milestone precisely**:
   `docs/architecture/platform-roadmap.md` §5 lists `Plugin Framework (planned)` as the
   last item under Infrastructure Platform, and §6 described its purpose exactly as
   built here: "allow future capabilities to extend ApnaBill without modifying the core.
   Uses the Event Bus, Diagnostics, the Job Engine, and the Audit Platform."

## 3. Non-goals (explicit, from the brief)

Not built here: any actual plugin beyond the one required demonstration, a dependency
injection framework, package/plugin loading from disk or network, a marketplace,
installer, updater, licensing, permissions, or sandboxing. Not modified here: ERP
business logic, the database schema, the Event Bus, Diagnostics, the Job Engine, the
Audit Platform, or any existing UI.

## 4. Key design questions answered

**Where does this platform live?** `js/services/extensions/`, a sibling of `events/`,
`diagnostics/`, `jobs/`, and `audit/`. Its dependencies are all four of those platforms'
public barrels — confirmed by grep: zero imports from `dataExchange/` or any business
file anywhere under `extensions/`. It is the only platform under `js/services/` that
depends on all four of the others; none of them import from it (the roadmap's own
"Infrastructure never depends on extensions").

**"Extension" or "Plugin"?** The milestone name uses both ("Plugin & Extension
Framework"); the brief's own component list uses "Extension" throughout ("Extension
Registry," "Extension Contract," "Extension Context"). This design follows the brief's
own vocabulary — every file, type, and function under `extensions/` says "extension," not
"plugin" — and treats the two words as referring to the same concept.

**Why is the Extension Registry a runtime construct, not a static data table?** Same
reason the Job Registry (11D) is: an extension bundles real, executable lifecycle hooks,
not just metadata, so "central registry" is necessarily a stateful service
(`createExtensionRegistry()`), matching every other factory-function service in this
codebase.

**What does "declare capabilities instead of directly coupling to other extensions"
actually buy an extension author?** A capability is a named contract, not an extension
id. An extension that needs "something providing stock alerts" asks
`capabilityRegistry.getProviders('stock-alerts')` instead of hardcoding a specific
extension's id — swapping which extension provides that capability, or having two
provide it simultaneously, requires no change to the consumer. §9 covers the mechanism
in full; §14 covers why this registry is deliberately "dumb" (no automatic resolution).

**Why can't an Extension Context register a new background job?** A genuine,
disclosed architectural tension, not an oversight — see §10.

## 5. Design principles

1. **Reuse, never duplicate.** Every infrastructure capability an extension gets
   (events, diagnostics, audit query, job observation) is a controlled view over the
   *existing* platform, constructed fresh per extension, never a second implementation.
2. **Self-protecting, isolated.** A broken extension hook is caught, classified, logged,
   and never rethrown — the same failure-isolation pattern every infrastructure
   subscriber in this codebase (11C/11D/11E) already established.
3. **Validated before registered.** Duplicate ids, missing dependencies, incompatible
   versions, and circular dependencies are all rejected at `register()` time, before an
   extension ever reaches the registry — never discovered later at `start()` time by
   surprise.
4. **Ordering has real teeth.** A declared dependency isn't just a registration-time
   check — `start()` refuses to start an extension before every dependency it declared
   has itself already started.
5. **No new mechanism where an old one already works.** No dependency-injection
   framework, no plugin loader, no marketplace — "prefer extension over modification,"
   "do not over-engineer," repeated verbatim from the brief.

## 6. Proposed architecture

```
js/services/extensions/
  index.js                    public barrel + a constructed, empty `extensionRuntime`
  contracts/
    extensionContract.js        createExtensionDefinition(), assertValidExtensionDefinition()
  registry/
    extensionRegistry.js         no duplicate ids, version tracking, enable/disable, remove
    capabilityRegistry.js        declared capabilities -> provider extension id lookup
  validation/
    dependencyValidator.js       duplicate/missing-dependency/version/circular-dependency detection
  context/
    extensionContext.js          controlled access to events/diagnostics/audit/jobs -- never raw ERP modules
  lifecycle/
    extensionLifecycleManager.js register/initialize/start/stop/dispose/unregister, per-hook self-protection
  extensions/
    sampleExtension.js           the ONE demonstration extension (test-only, never registered in production)
  shared/
    freezeDeep.js, semver.js     self-contained primitives, see §4
  extensionFramework.test.html
```

## 7. Component diagram

```
                     createExtensionDefinition()
                              │
                              ▼
                     extensionRegistry.register(definition)
                              │  runs validateExtension() first --
                              │  duplicate id / missing dep / version / circular
                              ▼
                     REGISTERED  (capabilityRegistry.registerCapabilities())
                              │
                     lifecycleManager.initialize(id)
                              │  builds this extension's own ExtensionContext
                              │  calls hooks.onInitialize(context)  [self-protected]
                              ▼
                     INITIALIZED
                              │
                     lifecycleManager.start(id)
                              │  requires every declared dependency already STARTED
                              │  requires registry.isEnabled(id)
                              │  calls hooks.onStart(context)  [self-protected]
                              ▼
                     STARTED  ──────► extension's own hooks may now subscribe to
                              │        Domain Events, write Diagnostics, query Audit,
                              │        observe the Job Dispatcher -- all through its
                              │        own ExtensionContext only
                     lifecycleManager.stop(id) / dispose(id) / unregister(id)
                              │  [self-protected]  unregister() = stop (if started)
                              ▼    + dispose + remove from both registries
                     STOPPED → DISPOSED  (or fully removed via unregister())
```

## 8. The Extension Contract

Exactly the fields the brief names: `id`, `name`, `version`, `description`, `author`,
`capabilities`, `dependencies`, lifecycle `hooks`. Every hook
(`onInitialize`/`onStart`/`onStop`/`onDispose`) is optional — an extension that only
needs some phases simply omits the rest. `dependencies` is `{id, minVersion?}[]`;
`minVersion` is optional, letting an extension require "any registered version" or a
specific floor.

## 9. Capability Registry — decoupling, not automatic resolution

`registry/capabilityRegistry.js` maps a capability name to the set of extension ids that
declared it. It is deliberately "dumb": it does not enforce exactly one provider per
capability, does not rank providers, and does not pick "the" provider automatically — a
consumer that calls `context.capabilities.getProviders('X')` decides what to do with the
(possibly empty, possibly multi-element) result itself. This is a considered choice, not
an unfinished feature: automatic provider resolution (priority, conflict handling, a
"the first one wins" rule) has no concrete use case yet, and inventing one would be
exactly the "over-engineering" the brief warns against. A future milestone with a real
need for smarter resolution can build it on top of `getProviders()` without any change to
this registry.

## 10. What Job Dispatcher access does NOT include

The Extension Context (§11) exposes `context.jobs.getRunHistory()` and
`context.jobs.isRunning()` — read-only observation of the Job Dispatcher. It does **not**
let an extension register a new background job. This is a real, disclosed architectural
tension, not an oversight: `jobs/registry/jobIds.js` is a closed catalog by 11D's own
design ("no ad hoc string literals... `register()` rejects any definition whose id is not
one of `JOB_IDS`"), and this milestone's strict rules forbid modifying the Job Engine to
loosen that catalog. Two alternatives were considered and rejected (§15). The honest
resolution: extensions can *observe* job activity today; a future milestone that
specifically wants extension-registered jobs would need to deliberately redesign
`jobs/registry/jobIds.js`'s closed-catalog model — out of this milestone's scope, and
flagged, not silently worked around.

## 11. The Extension Context — controlled, not raw

```
context.events        subscribe/unsubscribe/publish + EVENT_TYPES (the same capability
                       any other Event Bus subscriber has)
context.diagnostics    one structured logger scoped to `extension.<id>`, plus the pure
                       classifyError/describeError functions
context.audit          createAuditQueryApi(store) -- READ ONLY; an extension can query
                       audit history, never write a record itself
context.jobs           getRunHistory()/isRunning() -- READ ONLY (§10)
context.capabilities   getProviders(name)/hasCapability(name) -- capability discovery (§9)
```

Nothing here is a raw ERP module, a raw platform singleton, or an unrestricted surface —
every field is either read-only, scoped to the one extension it was built for, or exactly
as permissive as any other Event Bus subscriber already is. "Do NOT expose internal ERP
modules directly" is satisfied structurally: `context/extensionContext.js` imports only
from `events/`, `diagnostics/`, and `audit/`'s public barrels (§4), and the Job
Dispatcher instance it wraps is passed in already-constructed, never imported from
`dataExchange/` or any business file.

## 12. Lifecycle ordering

Two independent ordering guarantees, both enforced by
`lifecycle/extensionLifecycleManager.js`:

1. **Per-extension**: each transition requires the correct prior state
   (`initialize` requires `REGISTERED`, `start` requires `INITIALIZED`, `stop` requires
   `STARTED`, `dispose` requires `INITIALIZED`/`STARTED`/`STOPPED`) — calling one out of
   order throws immediately, before any hook runs.
2. **Cross-extension**: `start(id)` additionally requires every dependency `id` declared
   to already be in the `STARTED` state. This is what gives `dependencies` real runtime
   teeth beyond the registration-time existence/version check
   (`validation/dependencyValidator.js` only proves a dependency *exists* and is
   *version-compatible* at `register()` time — it says nothing about whether it has
   actually been started yet, which is what `start()`'s own check adds).

`unregister(id)` is a convenience, not a sixth lifecycle phase: it runs `stop()` (if
currently `STARTED`) then `dispose()` then removes the extension from both the Extension
Registry and the Capability Registry in one call — "unregister cleanly," the
demonstration's own last step.

## 13. Error handling and failure isolation

Every hook call (`onInitialize`/`onStart`/`onStop`/`onDispose`) is wrapped in its own
`safeCall()` — caught, classified via `diagnostics/errors/errorClassifier.js`, logged,
and **never rethrown**. A broken extension's hook can never crash the Lifecycle Manager,
never blocks a sibling extension's own lifecycle transitions, and never prevents the
manager itself from continuing to operate normally afterward — the identical guarantee
`diagnostics/observer/eventObserver.js`, `jobs/dispatcher/jobDispatcher.js`, and
`audit/subscriber/auditSubscriber.js` already provide for their own respective
subscribers.

## 14. Risks

- **A future extension author assumes `getProviders()` picks a "best" provider
  automatically.** Mitigated by §9's explicit disclosure — it never does, and never will
  without a deliberate future decision.
- **A future extension author is surprised Job Dispatcher access is read-only.**
  Mitigated by §10's explicit disclosure in both this document and
  `docs/extension-framework-architecture.md`.
- **Someone assumes `unregister()` is itself a sixth lifecycle state.** It is not — it is
  a convenience wrapper over the same five states; `getState()` only ever returns one of
  the five `LIFECYCLE_STATE` values (or `null` once unregistered).

## 15. Alternatives considered

- **Let extensions register jobs by loosening `jobs/registry/jobIds.js`'s closed
  catalog.** Rejected — the brief's strict rules forbid modifying the Job Engine in this
  milestone; §10 discloses the resulting limitation instead of working around it.
- **Auto-resolve one "winning" provider per capability instead of returning every
  provider.** Rejected in §9 — no concrete need yet, and it would remove information
  (which alternatives exist) a future consumer might actually want.
- **A generic dependency-injection container instead of the Extension Context's fixed,
  hand-written surface.** Rejected outright by the brief ("do not introduce dependency
  injection frameworks"); a fixed, auditable surface is also simpler to reason about for
  "do not expose internal ERP modules directly" than a general-purpose DI container ever
  could be.
- **Load extension code from disk/network at runtime.** Rejected outright by the brief;
  this milestone's `sampleExtension.js` is a plain, statically-imported ES module, the
  same as every other file in this codebase — there is no plugin *loading* mechanism at
  all, only a plugin *lifecycle* mechanism for definitions a caller already has in hand.

## 16. Final recommendation

Build exactly the module described in §6, register no real extension anywhere in the
application (only the one required demonstration, exercised solely by its own test
suite), and hand the finished, tested, documented framework to whichever future milestone
builds the first real extension. `docs/extension-framework-architecture.md` §14 gives
them enough to start without re-deriving any decision made here. This closes the roadmap's
approved infrastructure sequence (11A–11F); nothing beyond 11F is speculated on here or
in the roadmap itself.
