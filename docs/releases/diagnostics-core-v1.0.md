# Release: diagnostics-core-v1.0

**Tag:** none, by design — consolidated under `infrastructure-platform-v1.0` (see note
below) · **Commit:** `e407b8f` (`master`) · **Date:** 2026-07-25

This is a release checkpoint document, not a design document. It records Milestone 11C's
own scope for anyone picking up work afterward. It documents **Milestone 11C only** —
kept as its own file, deliberately not folded into `docs/releases/event-integration-v1.0.md`,
per instruction. **Update (post-commit):** 11C was ultimately committed together with 11A,
11B, and 11D as one single, deliberate commit, `e407b8f` — no separate
`diagnostics-core-v1.0` tag was created for this scope alone, by explicit instruction. The
authoritative, complete release record for all four milestones is
`docs/releases/infrastructure-platform-v1.0.md`, tagged `infrastructure-platform-v1.0`.
For design rationale and build/verification detail, see
`docs/milestone-11c-diagnostics-design.md`, `docs/diagnostics-architecture.md`, and
`docs/milestone-11c-diagnostics-report.md` — not repeated here.

## What this checkpoint originally got right, and what changed

This document originally proposed committing 11A/11B and 11C as two separate,
independently-tagged releases (see the git history of this file for that plan in full).
That did not happen — all four milestones (11A–11D) landed in one commit, `e407b8f`,
under one consolidated tag, `infrastructure-platform-v1.0`, per explicit instruction. The
technical content below (what 11C built, its architecture, its own regression figures at
the time) remains an accurate, verified record of 11C's own scope and is retained for
that reason; only the commit/tag framing has been corrected.

## Release Summary

Milestone 11C (Diagnostics & Observability Platform) adds a passive observation layer —
structured logging, trace context, Event Bus observation, execution timing, error
classification, performance metrics, and diagnostic report builders — under a new, fully
isolated `js/services/diagnostics/` platform. It changed **zero existing files** (a
stronger guarantee than 11B, which modified 18 existing files): confirmed by `git status`
at the time showing the identical 18 modified paths from the 11B checkpoint,
byte-for-byte unchanged, plus 11C's additions layered on top as new paths only. No
database schema change, no public API change, no UI change, no workflow change, no
business logic change. Full regression at this scope: **702/702 passing** — 11B's own
634 (see `event-integration-v1.0.md`, corrected) plus 68 new `diagnostics.test.html`
checks.

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
| **Total** | **702/702 ✅** |

Re-run headlessly (`python -m http.server` + Chrome `--headless=new --dump-dom`) as part
of the consolidated `infrastructure-platform-v1.0` verification pass against commit
`e407b8f` — see that checkpoint for the full, current 12-suite/756-check total including
11D. Every count matches the `event-integration-v1.0` checkpoint exactly (once that
document's own arithmetic was corrected — see its "Release Summary") except the new
`diagnostics.test.html` suite. No suite skipped, no suite modified beyond what
`event-integration-v1.0` already documented.

## Known Limitations

- **Diagnostics observes only its own processing latency, not other subscribers'** —
  structural, not a bug (see "Architecture Changes" above and design doc §7).
- **`diagnosticsObserver` is constructed but not started anywhere** — importing
  `diagnostics/index.js` has zero effect on the running application; no bootstrap or page
  was touched to call `.start()`. This is what makes 11C's backward-compatibility
  guarantee trivial to verify (there is no live code path to regress). Starting real
  observation is left to a future milestone.
- **No persistence** for any collected metrics/timeline/log data — by design; the Audit
  Platform is the natural place for persistence.
- All `event-integration-v1.0` limitations carry forward unchanged (three unpublished
  registry entries, no Core ERP test harness, informal payload shapes, etc.) — this
  checkpoint does not re-list them; see that document.

## Technical Debt

- Cross-subscriber failure visibility would require a future, opt-in Event Bus
  enhancement — not attempted here, flagged only.
- No formal schema for `LogEntry`/`TimelineEntry`/metrics snapshot shapes beyond this
  platform's own JSDoc typedefs — acceptable for infrastructure with no consumer yet;
  worth revisiting once the Audit Platform is the first real consumer. (Milestone 11D,
  the Background Job Engine, turned out to be the first real consumer of `diagnostics/`'s
  factories — see `docs/job-engine-architecture.md` §8 — but it instantiates its own
  copies rather than depending on a shared schema, so this item is still open.)
- Same carried-forward items as `event-integration-v1.0` (payload schemas, unwired
  registry entries, `crc32.js` promotion, entity-scope gaps).

None of the above are release blockers; all were already disclosed in
`docs/milestone-11c-diagnostics-report.md` at implementation time.

## Repository State

Verified at commit `e407b8f`:

- **Paths belonging to 11C**: `js/services/diagnostics/` (16 files, entirely new),
  `docs/milestone-11c-diagnostics-design.md`, `docs/milestone-11c-diagnostics-report.md`,
  `docs/diagnostics-architecture.md`, `docs/releases/diagnostics-core-v1.0.md` (this
  file), plus one small addition to `docs/event-bus-architecture.md` §9 (updating its
  "Future milestones" list now that 11C is done) — all committed together with 11A's,
  11B's, and 11D's own files in this one commit.
- **No generated, temporary, or debug artifact files** among the new files.
- **No `TODO`/`FIXME` placeholders** added anywhere under `js/` by this work.
- **No accidental `console.log`/`console.debug` calls** — `diagnostics/logging/
  consoleSink.js` is this platform's own designated, pluggable sink, by design, same
  convention `events/`/`dataExchange/` already established.
- **`node --check` passed** on all 15 new `.js` files before the suite ran.

## Future Milestones

Per `docs/diagnostics-architecture.md` §12 and
`docs/milestone-11c-diagnostics-report.md` §9 — updated to reflect what has since
shipped:

- 11D Background Job Engine (done, live) — reused `createExecutionTimeline()`/
  `createMetricsRecorder()` independent of the Event Bus, exactly as anticipated below;
  see `docs/job-engine-architecture.md`.
- The Audit Platform — still open, the natural next `ALL_EVENTS` subscriber.
- A future Plugin Framework — plugins use this platform's logger/timeline like any
  first-party module.
- A future Diagnostics Dashboard — calls `createDiagnosticReport()` periodically.
- Starting `diagnosticsObserver` for real, from an actual bootstrap — still open; 11D
  deliberately used its own fresh instances instead (see
  `docs/job-engine-architecture.md` §8).
- All `event-integration-v1.0` future items carry forward unchanged.

## Recommendation

11C shipped as part of commit `e407b8f`, tagged `infrastructure-platform-v1.0` together
with 11A, 11B, and 11D. This document's own regression total was corrected during that
consolidation pass (previously mis-summed as 682; the verified figure is 702 — see
"Release Summary" above) to match the current state. No further action is needed against
this document; see `docs/releases/infrastructure-platform-v1.0.md` for the authoritative,
complete record.
