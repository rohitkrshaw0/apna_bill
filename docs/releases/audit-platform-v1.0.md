# Release: audit-platform-v1.0

**Tag:** `audit-platform-v1.0` · **Commit:** `ab71b45` (`master`) · **Date:** 2026-07-25

This is a release checkpoint document, not a design document. It records the state of
the repository at this tag for anyone picking up work afterward. For full design
rationale and verification detail, see `docs/milestone-11e-audit-platform-design.md`,
`docs/milestone-11e-audit-platform-report.md`, and the living architecture reference,
`docs/audit-platform-architecture.md` — not repeated here.

## Release Summary

Milestone 11E (Audit Platform) is merged into `master` and tagged. It adds
`js/services/audit/` — an immutable, append-only record of business history, subscribing
directly to the Domain Event Bus as a first-class peer of Diagnostics (11C) and the
Background Job Engine (11D), never routed through either. No database schema change, no
public API change, no UI change, no workflow change, and no change to any existing file
outside the four living architecture docs updated to note 11E is done
(`event-bus-architecture.md`, `diagnostics-architecture.md`, `job-engine-architecture.md`,
`docs/architecture/platform-roadmap.md`). Full regression: **818/818 passing** (756
carried over unmodified from `infrastructure-platform-v1.0` + 62 new).

## Major Features

- **Audit Registry** (`audit/registry/auditRegistry.js`) — every currently-registered
  Domain Event type is audited by default, versioned independently of the event
  envelope's own `version` field. A *future* event type is not audited automatically — it
  must be explicitly added here first, a deliberate opt-in gate rather than a silent
  blanket capture.
- **Audit Record Contract** (`audit/contracts/auditRecord.js`) — the exact ten fields
  specified: `auditId`, `eventId`, `eventType`, `aggregate`, `aggregateId`, `timestamp`,
  `traceContext`, `metadata`, `payload`, `version`. Every record is deep-frozen at
  construction — never edited, updated, rewritten, or deleted.
- **Audit Store** (`audit/store/auditStore.js`) — storage is fully abstracted
  (`assertValidAuditStore()`); the one shipped reference implementation is an in-memory
  store that is *deliberately unbounded*, since capping it (the way Diagnostics' timeline
  or the Job Engine's run history cap theirs) would silently violate the "never deleted,
  append-only" guarantee. A future persistent store can implement the same contract with
  no change to the subscriber or query layer.
- **Audit Query API** (`audit/query/auditQueryApi.js`) — `byAuditId`, `byAggregate`,
  `byEventType`, `byTimeRange`, `byTraceId` (matches an explicit `traceId` or a
  diagnostics-generated `correlationId`). Infrastructure only — no UI, no screens.
- **Audit Subscriber** (`audit/subscriber/auditSubscriber.js`) — the one `eventBus.subscribe(ALL_EVENTS, ...)`
  registration this platform makes, self-protected (a broken store or malformed event is
  caught, logged, and never rethrown — audit failures never block, roll back, modify, or
  retry the ERP), and reuses diagnostics' Trace Context and fresh
  logger/timeline/metrics instances rather than duplicating any of that logic. Contains
  zero imports from `js/services/jobs/` and zero calls to `eventBus.publish` anywhere,
  confirmed by grep.
- **Constructed, not started** — `auditSubscriber` (exported from `audit/index.js`) has
  no live subscription anywhere in this release. Unlike 11D, this milestone's brief gave
  no instruction to wire real startup, so none was added — importing the module has zero
  effect on the running application.

## Architecture Changes

One new, fully self-contained platform, `js/services/audit/`, sibling to `js/services/events/`,
`js/services/diagnostics/`, and `js/services/jobs/` — confirmed by `git show --stat`
showing every added path rooted under that one new folder plus three new doc files.
Dependency direction is strictly `audit/` → `events/` and `audit/` → `diagnostics/`,
never the reverse, and never `audit/` → `jobs/` (the brief's own explicit, load-bearing
constraint — Audit is a peer of the Job Engine, not a consumer of it). No platform's
internals were modified: `bus/eventBus.js`, `contracts/eventEnvelope.js` (11A), and every
file under `diagnostics/` and `jobs/` are byte-for-byte unchanged by this release.

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
| `audit/audit.test.html` (11E, new) | 62/62 ✅ |
| `ui/forms/forms.test.html` | 80/80 ✅ |
| **Total** | **818/818 ✅** |

Re-run directly against the tagged commit (`ab71b45`), via `python -m http.server` +
headless Chrome `--dump-dom`, the same zero-build-step harness convention every prior
milestone uses. Every count matches `infrastructure-platform-v1.0` exactly except the new
`audit.test.html` suite (756 + 62 = 818). `node --check` was also run against all 8 new
`.js` files, confirming no parse error was introduced.

## Files changed (16 total: 12 added, 4 modified)

**Added** (12): `js/services/audit/` (9 files: `index.js`, `registry/auditRegistry.js`,
`contracts/auditRecord.js`, `store/auditStore.js`, `query/auditQueryApi.js`,
`subscriber/auditSubscriber.js`, `shared/freezeDeep.js`, `shared/generateId.js`,
`audit.test.html`), plus `docs/milestone-11e-audit-platform-design.md`,
`docs/milestone-11e-audit-platform-report.md`, `docs/audit-platform-architecture.md`.

**Modified** (4, doc-only, no code): `docs/event-bus-architecture.md`,
`docs/diagnostics-architecture.md`, `docs/job-engine-architecture.md`, and
`docs/architecture/platform-roadmap.md` — each updated only to note that 11E is done and
to correct one stale forward-guess in `job-engine-architecture.md` (that Audit might
consume `jobDispatcher.getRunHistory()` — it doesn't; the two are independent, parallel
observers of the same event stream, not a producer/consumer relationship).

Full per-file purpose table: see `docs/milestone-11e-audit-platform-report.md` §3.

## Known Limitations

- **No real persistence.** The shipped `createInMemoryAuditStore()` is in-memory only and
  lost on every page navigation, same as every other in-memory platform state in this
  multi-page application. The storage abstraction exists specifically so a future
  milestone can add a real persistent store without touching the subscriber or query API
  — not attempted here since it would require a database schema change this milestone
  does not authorize.
- **Unbounded memory growth** in the in-memory reference store over a very long,
  high-event-volume session — a disclosed, real tension between "never deleted" and
  "memory safe" for an in-memory implementation specifically, resolved architecturally
  (the storage abstraction), not operationally (no cap was added, since capping would
  silently violate "never deleted").
- **No live subscriber running anywhere.** `auditSubscriber.start()` is never called in
  this release. A future milestone wires it in, the same way 11D wired
  `startBackgroundInfrastructure()` into real pages.
- **A future event type is not audited until explicitly registered** in
  `audit/registry/auditRegistry.js` — by design (see "Major Features" above), but worth
  remembering as a manual step whenever a future milestone adds a new Domain Event type.

## Technical Debt

- Real, persistent audit storage (a dedicated database table via its own RPC) — a future
  milestone's schema change, not this one's.
- Starting `auditSubscriber` for real, from an actual application bootstrap.
- Same carried-forward items as `infrastructure-platform-v1.0`: formal per-event-type
  payload schemas, cross-subscriber failure visibility, three unwired 11B registry
  entries, no Core ERP test harness, Data Exchange entity-scope gaps, `crc32.js`
  promotion.

None of the above are release blockers; all were already disclosed in
`docs/milestone-11e-audit-platform-report.md` at implementation time.

## Repository State

Verified directly as part of this checkpoint (2026-07-25), against tagged commit
`ab71b45`:

- **`git status --porcelain`**: clean at the time of tagging.
- **No generated, temporary, or debug artifact files** tracked anywhere in the repo.
- **No `TODO`/`FIXME` placeholders** introduced under `js/` by this milestone.
- **No accidental `console.log`/`console.debug` calls** — `audit/` has no logging sink of
  its own; it reuses `diagnostics/logging/consoleSink.js` via fresh
  `createStructuredLogger()` instances, exactly as 11D already established.
- **No commented-out production code** in any file this milestone touched.
- **Zero imports from `js/services/jobs/` anywhere under `audit/`**, and zero calls to
  `eventBus.publish` anywhere in the same tree — both confirmed by grep, the two
  load-bearing architectural constraints this milestone's brief specified.
- **All 9 added code/test files under `audit/` are git-tracked**, matching the working
  tree exactly.
- **Tag `audit-platform-v1.0`** exists, is annotated, and points at exactly `master`'s
  `ab71b45` — no drift between the tag and the branch tip.
- **Pushed to `origin`**: both `master` (fast-forwarded to `ab71b45`) and the
  `audit-platform-v1.0` tag are confirmed present on the remote.

## Future Milestones

Per `docs/audit-platform-architecture.md` §15 and
`docs/architecture/platform-roadmap.md` §6:

- **11F — Plugin & Extension Framework** — the next approved milestone; will use the
  Event Bus, Diagnostics, the Job Engine, and the Audit Platform, per the roadmap's own
  scope (nothing beyond 11F is speculated on there, and not here either).
- Real, persistent audit storage.
- Starting `auditSubscriber` for real.
- Future Analytics reading via the Audit Query API rather than re-observing the Event Bus
  independently.
- Same carried-forward Data Exchange and Event Bus items as prior checkpoints.

## Recommendation

The repository is clean at tag `audit-platform-v1.0` (commit `ab71b45`), fully
regression-tested (818/818 across 13 suites), and pushed to `origin`. **The repository is
ready for the next architecture milestone** (11F, Plugin & Extension Framework, per the
approved roadmap).
