# Milestone 11F — Plugin & Extension Framework: Report

Deliverables document for the Plugin & Extension Framework. Covers what was actually
built and verified; consult `docs/milestone-11f-extension-framework-design.md` for the
full design rationale (why each decision was made, alternatives considered, the Job
Dispatcher access tension) — not repeated here.

## 1. Objective

Build the generic infrastructure that lets future capabilities extend ApnaBill without
modifying the core application — infrastructure only, no actual plugin beyond one
required demonstration. Zero changes to ERP business logic, the database schema, the
Event Bus, Diagnostics, the Job Engine, the Audit Platform, or any existing UI. This is
the final milestone in the approved infrastructure roadmap.

## 2. Architecture implemented

```
createExtensionDefinition({...})
        │
        ▼
extensionRegistry.register(definition)   -- validateExtension() first: duplicate id /
        │                                    missing dependency / version / circular dep
        ▼
REGISTERED  →  lifecycleManager.initialize(id)  →  INITIALIZED
        │           builds this extension's own ExtensionContext
        │           (events / diagnostics / audit query / job observation / capabilities
        │            -- never a raw ERP module)
        ▼
lifecycleManager.start(id)   -- requires every declared dependency already STARTED
        │
        ▼
STARTED  →  lifecycleManager.stop(id) / dispose(id) / unregister(id)
                (unregister = stop-if-started + dispose + remove from both registries)

Every hook call self-protected: caught, classified via diagnostics, logged, never rethrown.
```

Architectural claim, verified not assumed: this milestone touches nothing outside the new
`js/services/extensions/` folder and three new doc files (plus the living architecture
docs updated to note 11F is done) — confirmed by `git status --porcelain`. `extensions/`
imports exclusively from `events/`, `diagnostics/`, `audit/`, and `jobs/`'s public
barrels; grep confirms zero imports from `dataExchange/` or any business file anywhere
under `extensions/`, and that none of the other four infrastructure platforms import
anything from `extensions/`.

## 3. Files added (14 files, all new)

| File | Purpose |
|---|---|
| `index.js` | Public barrel; constructs `extensionRuntime`, an empty, unstarted lifecycle manager |
| `contracts/extensionContract.js` | `createExtensionDefinition()`/`assertValidExtensionDefinition()` — the eight-field `ExtensionDefinition` |
| `registry/extensionRegistry.js` | `createExtensionRegistry()` — register (validated)/get/list/remove/setEnabled/isEnabled/getVersion |
| `registry/capabilityRegistry.js` | `createCapabilityRegistry()` — capability → provider-id lookup, deliberately not auto-resolving |
| `validation/dependencyValidator.js` | `validateExtension()` — duplicate id / missing dependency / version incompatibility / circular dependency (DFS) |
| `context/extensionContext.js` | `createExtensionContext()` — the controlled surface: events/diagnostics/audit-query/job-observation/capabilities, never a raw ERP module |
| `lifecycle/extensionLifecycleManager.js` | `createExtensionLifecycleManager()` — register/initialize/start/stop/dispose/unregister, per-hook self-protection, cross-extension start-time dependency ordering |
| `extensions/sampleExtension.js` | The one required demonstration extension — test-only, never registered in production |
| `shared/freezeDeep.js`, `shared/semver.js` | Self-contained primitives (deep-freeze, a minimal major.minor.patch comparator) |
| `extensionFramework.test.html` | Zero-build test harness, same convention as every other `.test.html` in this codebase |

**Documentation** (`docs/`, 3 files, all new): `milestone-11f-extension-framework-design.md`,
`milestone-11f-extension-framework-report.md` (this document),
`extension-framework-architecture.md`.

## 4. Files modified

Living architecture docs only, no code: `docs/architecture/platform-roadmap.md` (moves
11F from "Upcoming" to "Completed," updates the dependency diagram and capability list),
plus a one-line "done" note added to whichever of `event-bus-architecture.md`/
`diagnostics-architecture.md`/`job-engine-architecture.md`/`audit-platform-architecture.md`
previously referenced a future Plugin Framework — see §6 for the exact list.

## 5. What was reused, unmodified

`events/index.js`'s public barrel (`eventBus`, `EVENT_TYPES`, `createEventBus`),
`diagnostics/index.js`'s public barrel (`createStructuredLogger`, `classifyError`,
`describeError`), `audit/index.js`'s public barrel (`createAuditQueryApi`,
`createInMemoryAuditStore`, `auditSubscriber`), and `jobs/index.js`'s public barrel
(`createJobDispatcher`, `jobDispatcher`) — all imported, none modified. Nothing from
`dataExchange/` or any business file was imported anywhere in this platform.

## 6. Regression status

| Suite | Result |
|---|---|
| `js/services/extensions/extensionFramework.test.html` (11F, new) | 64/64 ✅ |
| `js/services/audit/audit.test.html` | 62/62 ✅ (unchanged) |
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
| **Total** | **882/882 ✅** |

Every suite re-run headlessly (`python -m http.server` + Chrome `--headless=new
--dump-dom`). Every count matches its prior checkpoint exactly except the new
`extensionFramework.test.html` suite (818 at `audit-platform-v1.0` + 64 new = 882).
`node --check` was run against all 10 new `.js` files before the suite ran.

## 7. New test coverage — 64 checks, one new suite

`extensionFramework.test.html` covers every area the brief's "Testing" section names:

- **Registration**: well-formed definitions accepted, every required-field omission
  rejected, hooks default to `null` when omitted.
- **Lifecycle**: the full `register → initialize → start → stop → dispose` sequence, in
  order, each transition's hook actually called and logged; out-of-order calls
  (`start()` before `initialize()`, `stop()` before `start()`) rejected.
- **Capability discovery**: a sole provider found, multiple providers of a shared
  capability all found, `hasCapability`/`listCapabilities` correctness,
  `unregisterCapabilities` removing only the correct extension's own declarations.
- **Dependency validation**: missing dependency, incompatible version, a satisfied
  version passing, duplicate id — all via `validateExtension()` directly — plus direct
  `detectCircularDependency()` checks proving a valid (non-circular) dependency chain and
  a diamond-shaped graph are both correctly NOT flagged.
- **Duplicate detection**: `registry.register()` itself throws `[DUPLICATE_ID]` for a
  second registration of the same id.
- **Version validation**: `parseVersion`/`compareVersions`/`satisfiesMinVersion` sanity
  checks, plus the registry-level incompatible-version rejection above.
- **Lifecycle ordering**: cross-extension — starting a dependent before its dependency
  has started throws; starting it after the dependency has started succeeds. A disabled
  extension's `start()` returns `false` and never calls `onStart`.
  `unregister()`'s convenience teardown verified from both `STARTED` (runs stop then
  dispose) and from `INITIALIZED`-only (never started — disposes directly, still cleanly).
- **Event Bus integration**: the sample extension observes real events published on a
  real (isolated) `eventBus`.
- **Diagnostics integration**: every lifecycle transition logged via the manager's own
  logger; the sample extension's own scoped logger (via its `ExtensionContext`) verified
  separately, proving each extension gets its own diagnostics identity, not a shared one.
- **Audit integration**: the sample extension's own `context.audit.query` is live against
  the real Audit Store shared with a real (isolated) `Audit Subscriber` — proven to grow
  from 0 to 1 matching record across two publishes (see report §8 for why not one).
- **Failure isolation**: a throwing `onStart` hook never escapes `start()`, is logged,
  and a sibling extension's own lifecycle is completely unaffected.
- **The demonstration extension end to end**: registers, initializes, subscribes to a
  real Domain Event (`ItemCreated`), writes Diagnostics, queries Audit, and unregisters
  cleanly — every one of the "Demonstration" section's six required steps, verified in
  one continuous block.
- **The shared `extensionRuntime` singleton**: empty registry, no extension state, by
  default.

## 8. Behavior notes

- `extensionRuntime` (exported from `index.js`) starts with zero registered extensions —
  this milestone registers no real extension anywhere in the application; only the one
  required demonstration exists, and only inside its own test suite.
- Within a single `eventBus.publish()` call, a specific-type subscriber (like the sample
  extension's own `ItemCreated` subscription) runs *before* a wildcard subscriber (like
  the Audit Subscriber) in the same synchronous dispatch pass — a pre-existing Event Bus
  behavior (11A), not something this milestone introduced. This is why the
  demonstration's own audit-query check needed two publishes to observe a non-zero
  result: on the first event, Audit genuinely hasn't recorded anything yet at the moment
  the sample extension's handler runs.
- Extension Context's Job Dispatcher access is read-only (`getRunHistory`/`isRunning`) —
  extensions cannot register new background jobs through this framework (design doc §10).

## 9. Remaining technical debt

- **No extension-registered jobs.** `jobs/registry/jobIds.js`'s closed catalog (11D's own
  design) means an extension cannot add a new job id without a future, deliberate
  redesign of that catalog — out of this milestone's scope, disclosed not worked around.
- **No automatic capability resolution.** `getProviders()` returns every provider; picking
  "the" one to use is left to the consumer — no concrete need for smarter resolution
  exists yet (design doc §9).
- **No live extension anywhere.** `extensionRuntime` has nothing registered; a future
  milestone that builds a real extension registers it there (or in its own isolated
  runtime) the same way `sampleExtension.js`'s own test does.

None of the above are milestone blockers; all are already disclosed in the design doc.

## 10. Final assessment

The repository gained one new, fully isolated, fully tested infrastructure module — the
fifth and final infrastructure platform in the approved roadmap — plus three new
documentation files and small "done" updates to four living architecture docs and the
roadmap itself. No existing business file, database schema, or other infrastructure
platform's internals changed. All 64 new checks pass; every pre-existing suite (882 total
checks across 14 suites) remains green with identical counts to the prior checkpoint.
**Milestone 11F is complete: the Plugin & Extension Framework exists, reuses every
existing infrastructure platform unchanged, is validated end to end by one working
demonstration extension, and closes the infrastructure roadmap (11A–11F).**
