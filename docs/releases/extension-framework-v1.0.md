# Release: extension-framework-v1.0

**Tag:** `extension-framework-v1.0` · **Commit:** `9cc46cc` (`master`) · **Date:**
2026-07-26

This is a release checkpoint document, not a design document. It records the state of
the repository at this tag for anyone picking up work afterward. For full design
rationale and verification detail, see `docs/milestone-11f-extension-framework-design.md`,
`docs/milestone-11f-extension-framework-report.md`, and the living architecture
reference, `docs/extension-framework-architecture.md` — not repeated here.

## Release Summary

Milestone 11F (Plugin & Extension Framework) is merged into `master` and tagged. It adds
`js/services/extensions/` — the generic infrastructure that lets future capabilities
extend ApnaBill without modifying the core application. **This closes the approved
infrastructure roadmap (11A–11F)**: no further infrastructure milestone is currently
approved. No actual plugin was built beyond one required demonstration extension. No
database schema change, no public API change, no UI change, no workflow change, and no
change to any other infrastructure platform's internals (Event Bus, Diagnostics, Job
Engine, Audit — all byte-for-byte unchanged). Full regression: **882/882 passing** (818
carried over unmodified from `audit-platform-v1.0` + 64 new).

## Major Features

- **Extension Contract** (`extensions/contracts/extensionContract.js`) — the exact eight
  fields specified: `id`, `name`, `version`, `description`, `author`, `capabilities`,
  `dependencies`, lifecycle `hooks` (all four optional). Every definition is deep-frozen.
- **Extension Registry** (`extensions/registry/extensionRegistry.js`) — no duplicate ids
  (validated at `register()`, before a definition is ever stored), version tracking,
  enable/disable state independent of lifecycle state.
- **Capability Registry** (`extensions/registry/capabilityRegistry.js`) — extensions
  declare capabilities instead of directly coupling to other extensions' ids; deliberately
  "dumb" (returns every provider, never auto-resolves a winner — no concrete need for
  that yet).
- **Dependency Validation** (`extensions/validation/dependencyValidator.js`) — duplicate
  ID, missing dependency, version incompatibility (a minimal, self-contained
  major.minor.patch comparator), and circular dependency (DFS over the full dependency
  graph) — all checked before a definition is accepted.
- **Extension Context** (`extensions/context/extensionContext.js`) — controlled access
  only: full Event Bus subscriber capability, one Diagnostics logger scoped to
  `extension.<id>`, **read-only** Audit Query API access, **read-only** Job Dispatcher
  observation (`getRunHistory`/`isRunning`). Never a raw ERP module — confirmed by grep,
  this file imports only from `events/`, `diagnostics/`, and `audit/`'s public barrels.
- **Lifecycle Manager** (`extensions/lifecycle/extensionLifecycleManager.js`) — the five
  states the brief specifies (`register`/`initialize`/`start`/`stop`/`dispose`), strict
  per-extension ordering, cross-extension dependency ordering enforced at `start()` (a
  dependency must already be `STARTED`), every hook call self-protected (caught,
  classified, logged, never rethrown), plus an `unregister()` convenience for clean
  teardown.
- **One demonstration extension** (`extensions/extensions/sampleExtension.js`) —
  registers, initializes, subscribes to a real Domain Event (`ItemCreated`), writes
  Diagnostics, queries Audit, unregisters cleanly. No business functionality. Exercised
  only by its own test suite — never registered in the real application.
- **`extensionRuntime` constructed empty** — the shared instance (exported from
  `extensions/index.js`) has zero registered extensions in this release.

## Architecture Changes

One new, fully self-contained platform, `js/services/extensions/`, sibling to
`js/services/events/`, `js/services/diagnostics/`, `js/services/jobs/`, and
`js/services/audit/` — confirmed by `git show --stat` showing every added path rooted
under that one new folder plus three new doc files. `extensions/` is the only
infrastructure platform that depends on all four of the others; none of them import
anything from it, confirmed by grep. No other platform's internals were modified.

One disclosed, deliberate architectural limitation: extensions get **read-only**
observation of the Job Dispatcher, not job registration —
`jobs/registry/jobIds.js` is a closed catalog by 11D's own design, and this milestone's
strict rules forbade modifying the Job Engine to loosen it. Three stale forward-references
in `job-engine-architecture.md` (written before this design was settled, speculating that
plugins would "register jobs through the same public API any other caller uses") were
corrected as part of this release to reflect what was actually built.

## Regression Status

| Suite | Result |
|---|---|
| `dataExchange.test.html` (9A) | 43/43 ✅ |
| `xmlImport.test.html` (9B + 11B) | 87/87 ✅ |
| `xmlExport.test.html` (9C + 11B) | 77/77 ✅ |
| `apnabill.test.html` (9D + 11B) | 52/52 ✅ |
| `apnabillRestore.test.html` (9E + 11B) | 72/72 ✅ |
| `migration.test.html` (9F) | 48/48 ✅ |
| `json/jsonExport.test.html` (10 + 11B) | 58/58 ✅ |
| `json/jsonImport.test.html` (10 + 11B) | 59/59 ✅ |
| `events/eventBus.test.html` (11A/11B) | 58/58 ✅ |
| `diagnostics/diagnostics.test.html` (11C) | 68/68 ✅ |
| `jobs/jobEngine.test.html` (11D) | 54/54 ✅ |
| `audit/audit.test.html` (11E) | 62/62 ✅ |
| `extensions/extensionFramework.test.html` (11F, new) | 64/64 ✅ |
| `ui/forms/forms.test.html` | 80/80 ✅ |
| **Total** | **882/882 ✅** |

Re-run directly against the tagged commit (`9cc46cc`), via `python -m http.server` +
headless Chrome `--dump-dom`, the same zero-build-step harness convention every prior
milestone uses. Every count matches `audit-platform-v1.0` exactly except the new
`extensionFramework.test.html` suite (818 + 64 = 882). `node --check` was also run
against all 10 new `.js` files, confirming no parse error was introduced.

## Files changed (19 total: 15 added, 4 modified — plus 1 more doc-only living-reference update landing alongside the tag)

**Added** (15): `js/services/extensions/` (10 files: `index.js`,
`contracts/extensionContract.js`, `registry/extensionRegistry.js`,
`registry/capabilityRegistry.js`, `validation/dependencyValidator.js`,
`context/extensionContext.js`, `lifecycle/extensionLifecycleManager.js`,
`extensions/sampleExtension.js`, `shared/freezeDeep.js`, `shared/semver.js`,
`extensionFramework.test.html`), plus `docs/milestone-11f-extension-framework-design.md`,
`docs/milestone-11f-extension-framework-report.md`,
`docs/extension-framework-architecture.md`.

**Modified** (4, doc-only, no code): `docs/event-bus-architecture.md`,
`docs/diagnostics-architecture.md`, `docs/job-engine-architecture.md`,
`docs/audit-platform-architecture.md` — each updated to note 11F is done, plus the
`job-engine-architecture.md` corrections described above. `docs/architecture/platform-roadmap.md`
was also updated in this same commit (moves 11F from "Upcoming" to "Completed," updates
the dependency diagram, capability list, and Living Architecture Documents list — and, in
the same pass, fills in the `audit-platform-v1.0` row that had been missing from §8 since
last release).

Full per-file purpose table: see `docs/milestone-11f-extension-framework-report.md` §3.

## Known Limitations

- **No extension-registered jobs.** Read-only Job Dispatcher observation only (see
  "Architecture Changes" above) — a future milestone would need to deliberately redesign
  `jobs/registry/jobIds.js`'s closed-catalog model first.
- **No automatic capability resolution.** `getProviders()` returns every declared
  provider; picking "the" one to use is left to the consumer.
- **No real extension anywhere.** `extensionRuntime` has nothing registered; the one
  demonstration extension exists only inside its own test suite.
- All `audit-platform-v1.0` limitations carry forward unchanged (in-memory-only Audit
  Store, no live Audit/Diagnostics subscriber running, three unwired 11B registry
  entries, no Core ERP test harness, Data Exchange entity-scope gaps, `crc32.js`
  promotion).

## Technical Debt

- A deliberate future redesign of `jobs/registry/jobIds.js` if extension-registered jobs
  are ever needed.
- Smarter capability resolution, if a concrete need for it ever arises.
- Same carried-forward items as `audit-platform-v1.0`.

None of the above are release blockers; all were already disclosed in
`docs/milestone-11f-extension-framework-report.md` at implementation time.

## Repository State

Verified directly as part of this checkpoint (2026-07-26), against tagged commit
`9cc46cc`:

- **`git status --porcelain`**: clean at the time of tagging.
- **No generated, temporary, or debug artifact files** tracked anywhere in the repo.
- **No `TODO`/`FIXME` placeholders** introduced under `js/` by this milestone.
- **No accidental `console.log`/`console.debug` calls** — `extensions/` has no logging
  sink of its own; every extension gets a fresh `createStructuredLogger()` instance via
  its own `ExtensionContext`, reusing `diagnostics/`'s existing sink pattern.
- **No commented-out production code** in any file this milestone touched.
- **Zero imports from `dataExchange/` or any business file anywhere under `extensions/`**,
  and no other infrastructure platform imports from `extensions/` — both confirmed by
  grep, the two load-bearing architectural constraints this milestone's brief specified.
- **All 11 added code/test files under `extensions/` are git-tracked**, matching the
  working tree exactly.
- **Tag `extension-framework-v1.0`** exists, is annotated, and points at exactly
  `master`'s `9cc46cc` — no drift between the tag and the branch tip.

## Future Milestones

Per `docs/extension-framework-architecture.md` §13 and
`docs/architecture/platform-roadmap.md` §6: **the approved infrastructure roadmap is
complete.** No further infrastructure milestone is currently approved. Any future work is
either:

- **A real extension**, built on this framework by whoever needs one — no framework
  change required.
- **A real, persistent Audit Store**, real background jobs beyond the three
  demonstrations, or a real live subscriber for Diagnostics/Audit — all previously
  disclosed, all deliberate deferrals, not blocked by anything in this release.
- **A deliberate, separately-approved new architectural phase** — not an extension of
  this roadmap, a new decision.

## Recommendation

The repository is clean at tag `extension-framework-v1.0` (commit `9cc46cc`), fully
regression-tested (882/882 across 14 suites), and the approved infrastructure roadmap
(11A–11F) is complete. **The repository is ready for real feature work built on this
infrastructure** — there is no next approved infrastructure milestone to prepare for.
