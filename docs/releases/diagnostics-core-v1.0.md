# Release: diagnostics-core-v1.0

**Tag:** not yet created · **Commit:** pending (working tree, base `9569e9d` on
`master`) · **Date:** 2026-07-25

This is a release checkpoint document, not a design document. It records the state of
the repository as of this checkpoint for anyone picking up work afterward. It documents
**Milestone 11C only** — kept as its own file, deliberately not folded into
`docs/releases/event-integration-v1.0.md`, per instruction. For design rationale and
build/verification detail, see `docs/milestone-11c-diagnostics-design.md`,
`docs/diagnostics-architecture.md`, and `docs/milestone-11c-diagnostics-report.md` — not
repeated here.

## A sequencing note this checkpoint must be honest about

Milestones 11A, 11B, and 11C are **all still uncommitted, in the same working tree**, on
top of the same `9569e9d` base `event-integration-v1.0` was also checkpointed against.
11C (`js/services/diagnostics/` + 3 new docs) adds no changes to any file 11A/11B already
touched — confirmed below — so it is a clean, independent diff on its own. But because
nothing has been committed yet, **two genuinely separate, independently-tagged releases
require two separate commits**, made in order: 11A+11B's 18 modified files + their docs
committed and tagged `event-integration-v1.0` first, then 11C's 16 new files + their docs
committed and tagged `diagnostics-core-v1.0` second. This checkpoint documents 11C's
changes in isolation (§"Repository State" below lists exactly which paths belong to it),
ready for that split whenever commits are actually made — nothing about the code requires
a particular commit order, only the tagging does.

## Release Summary

Milestone 11C (Diagnostics & Observability Platform) is implemented, tested, and
documented, but not yet committed. It adds a passive observation layer — structured
logging, trace context, Event Bus observation, execution timing, error classification,
performance metrics, and diagnostic report builders — under a new, fully isolated
`js/services/diagnostics/` platform. It changes **zero existing files** (a stronger
guarantee than 11B, which modified 18 existing files): confirmed by `git status` showing
the identical 18 modified paths from the 11B checkpoint, byte-for-byte unchanged, plus
11C's additions layered on top as new paths only. No database schema change, no public
API change, no UI change, no workflow change, no business logic change. Full regression:
**682/682 passing** (614 carried over from `event-integration-v1.0`'s 499 + the
pre-existing `forms.test.html`'s 80 and prior baseline math — see §Regression Status for
the exact per-suite table — plus 68 new).

## Major Features

- **Structured Logger** (`diagnostics/logging/`) — every entry a full structured object
  (`level`/`name`/`message`/`timestamp`/`trace`/`meta`), never a free-form string;
  `minLevel` filtering as the environment-awareness mechanism; `withTrace()` for binding
  a trace context once across several log calls.
- **Trace Context** (`diagnostics/trace/`) — reuses `events/`'s existing 7-field
  whitelist verbatim (no duplication, no modification to that frozen 11A file); adds one
  new field, `correlationId`, diagnostics' own bookkeeping identifier (generated only
  when the caller didn't supply one — never fabricated business data).
  `deriveTraceContextFromEvent()` builds a trace straight from an event's own metadata.
- **Error Classification** (`diagnostics/errors/`) — five categories (Validation,
  Business, Infrastructure, Network, Unexpected), never throws for any input shape,
  recognizes dataExchange-shaped errors by category STRING VALUE only (zero import of
  that platform).
- **Execution Timeline** (`diagnostics/timeline/`) — general-purpose start/finish/
  `time()`, a capped ring buffer, and a hard guarantee that a wrapped operation's own
  outcome (return value or thrown/rejected error) always passes through unchanged.
- **Performance Metrics** (`diagnostics/metrics/`) — event counts and duration/latency
  aggregates (count/avg/min/max), honestly scoped to what this architecture can actually
  measure (see "Known Limitations").
- **Event Observer** (`diagnostics/observer/`) — the one `ALL_EVENTS` subscriber this
  platform registers; strictly read-only (never calls `eventBus.publish` anywhere in this
  tree — confirmed by grep) and self-protected (an internal bug is caught, classified,
  and logged without ever reaching the Event Bus's own dispatch loop).
- **Diagnostic Report Builder** (`diagnostics/reports/`) — a pure function producing one
  frozen, structured snapshot combining metrics + timeline state, for future tooling. No
  UI anywhere in this milestone.

## Architecture Changes

None to the Event Bus, Event Integration, Migration Platform, JSON Platform, or any Core
ERP file — confirmed by `git diff`/`git status` showing zero lines changed anywhere
outside the new `js/services/diagnostics/` folder and three new doc files. The only
structural addition is a new, self-contained third infrastructure platform,
`diagnostics/`, sibling to `events/` and `dataExchange/`, following the same
barrel/module-map convention both already established. Its only outbound dependency is
`events/`'s public barrel (`eventBus`, `ALL_EVENTS`) — confirmed by grep: nothing under
`diagnostics/` imports from `dataExchange/` or any business file.

One disclosed, deliberate architectural limitation (not an exception to work around, an
honest boundary): the Event Bus does not expose one subscriber's failures or duration to
a sibling subscriber, so this platform's "handler duration"/"subscriber latency" metrics
describe **this observer's own** processing time only, never another subscriber's — see
`docs/milestone-11c-diagnostics-design.md` §7 for the full reasoning and the two
alternatives considered and rejected (modifying the frozen bus; monkey-patching
`subscribe()`).

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
| `ui/forms/forms.test.html` | 80/80 ✅ |
| `diagnostics/diagnostics.test.html` (11C, new) | 68/68 ✅ |
| **Total** | **682/682 ✅** |

Re-run headlessly (`python -m http.server` + Chrome `--headless=new --dump-dom`) against
the current working tree. Every count matches the `event-integration-v1.0` checkpoint
exactly except the new `diagnostics.test.html` suite. No suite skipped, no suite modified
beyond what `event-integration-v1.0` already documented.

## Known Limitations

- **Diagnostics observes only its own processing latency, not other subscribers'** —
  structural, not a bug (see "Architecture Changes" above and design doc §7).
- **`diagnosticsObserver` is constructed but not started anywhere** — importing
  `diagnostics/index.js` has zero effect on the running application; no bootstrap or page
  was touched to call `.start()`. This is what makes 11C's backward-compatibility
  guarantee trivial to verify (there is no live code path to regress). Starting real
  observation is left to a future milestone.
- **No persistence** for any collected metrics/timeline/log data — by design; 11D Audit
  is the natural place for persistence.
- All `event-integration-v1.0` limitations carry forward unchanged (three unpublished
  registry entries, no Core ERP test harness, informal payload shapes, etc.) — this
  checkpoint does not re-list them; see that document.

## Technical Debt

- Cross-subscriber failure visibility would require a future, opt-in Event Bus
  enhancement — not attempted here, flagged only.
- No formal schema for `LogEntry`/`TimelineEntry`/metrics snapshot shapes beyond this
  platform's own JSDoc typedefs — acceptable for infrastructure with no consumer yet;
  worth revisiting once 11D Audit is the first real consumer.
- Same carried-forward items as `event-integration-v1.0` (payload schemas, unwired
  registry entries, `crc32.js` promotion, entity-scope gaps).

None of the above are release blockers; all were already disclosed in
`docs/milestone-11c-diagnostics-report.md` at implementation time.

## Repository State

Verified directly as part of this checkpoint (2026-07-25), against the **working tree**:

- **Paths belonging to 11C, isolated from 11A/11B** (for the eventual separate commit,
  see "A sequencing note" above): `js/services/diagnostics/` (16 files, entirely new),
  `docs/milestone-11c-diagnostics-design.md`, `docs/milestone-11c-diagnostics-report.md`,
  `docs/diagnostics-architecture.md`, `docs/releases/diagnostics-core-v1.0.md` (this
  file), plus one small addition to `docs/event-bus-architecture.md` §9 (updating its
  "Future milestones" list now that 11C is done — the only line in any pre-existing
  tracked file this milestone touches).
- **`git status --porcelain`**: the same 18 modified files `event-integration-v1.0`
  already documented, byte-for-byte unchanged by this milestone, plus the new paths
  listed above. **Nothing is committed yet.**
- **No generated, temporary, or debug artifact files** among the new files.
- **No `TODO`/`FIXME` placeholders** added anywhere under `js/` by this work.
- **No accidental `console.log`/`console.debug` calls** — `diagnostics/logging/
  consoleSink.js` is this platform's own designated, pluggable sink, by design, same
  convention `events/`/`dataExchange/` already established.
- **`node --check` passed** on all 15 new `.js` files before the suite ran.
- **No tag exists yet** for `diagnostics-core-v1.0`, and none for `event-integration-v1.0`
  either — both remain deferred, separate steps for whenever the user is ready.

## Future Milestones

Per `docs/diagnostics-architecture.md` §12 and
`docs/milestone-11c-diagnostics-report.md` §9, still open and unaffected by this
checkpoint:

- 11D Audit — the natural next `ALL_EVENTS` subscriber.
- A future Background Jobs milestone — can reuse `createExecutionTimeline()`/
  `createMetricsRecorder()` independent of the Event Bus.
- A future Plugin Framework — plugins use this platform's logger/timeline like any
  first-party module.
- A future Diagnostics Dashboard — calls `createDiagnosticReport()` periodically.
- Starting `diagnosticsObserver` for real, from an actual bootstrap.
- All `event-integration-v1.0` future items carry forward unchanged.

## Recommendation

The implementation is complete, fully regression-tested against the working tree, and
contains no uncommitted debug/generated artifacts beyond the intended source and doc
changes. Two open items are procedural, not technical: **commit 11A+11B's files and tag
`event-integration-v1.0`, then separately commit 11C's files and tag
`diagnostics-core-v1.0`**, in that order, whenever the user is ready — nothing about the
code or docs blocks either step, and nothing requires them to happen together.
