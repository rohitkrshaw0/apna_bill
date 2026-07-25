# Release: infrastructure-platform-v1.0

**Tag:** `infrastructure-platform-v1.0` · **Commit:** `e407b8f` (`master`) · **Date:**
2026-07-25

This is a release checkpoint document, not a design document. It records the state of
the repository at this tag for anyone picking up work afterward. It is the **single,
consolidated** checkpoint for Milestones 11A–11D — by explicit instruction, no separate
tag exists for 11A/11B or for 11C alone; `docs/releases/event-integration-v1.0.md` and
`docs/releases/diagnostics-core-v1.0.md` remain on disk as detailed, corrected
point-in-time records of those two milestones' own scope, but this document is the
authoritative one for the tag itself. For full design rationale and per-milestone
verification detail, see `docs/milestone-11a-event-bus-design.md` /
`-report.md`, `docs/milestone-11b-event-integration-report.md`,
`docs/milestone-11c-diagnostics-design.md` / `-report.md`,
`docs/milestone-11d-job-engine-design.md` / `-report.md`, and the three living
architecture references (`docs/event-bus-architecture.md`,
`docs/diagnostics-architecture.md`, `docs/job-engine-architecture.md`) — not repeated
here.

## Release Summary

Four infrastructure platforms — the Domain Event Bus (11A), Domain Event Integration
(11B), the Diagnostics & Observability Platform (11C), and the Background Job Engine
(11D) — are merged into `master` and tagged as one architectural checkpoint, committed
together as `e407b8f` per explicit instruction (not four separate commits/tags). Built on
top of the unmodified, stable Production ERP, Migration Platform, and JSON Platform. No
database schema change. No business logic change. No UI change beyond one deliberate,
additive startup hook (11D, see below). Full regression: **756/756 passing** (12 suites;
see "Regression Status").

## Major Features

- **Domain Event Bus** (11A, `js/services/events/`) — a lightweight, synchronous,
  in-process event bus: envelope, registry (single source of truth for event type
  strings), bus (publish/subscribe/unsubscribe/`ALL_EVENTS`, per-subscriber isolation),
  optional context. Zero external dependencies. Built, not wired anywhere yet at this
  stage.
- **Domain Event Integration** (11B) — 12 of 15 registered event types (14 physical call
  sites) wired to their real, pre-existing success points across Core ERP
  (`purchases.js`, `sales.js`, `items.js`, `suppliers.js`, `manufacturing.js`,
  `supabaseClient.js`) and the six Data Exchange orchestration entry points. Zero change
  to any existing function's behavior, parameters, or return shape. One registry
  addition (`RestoreCompleted`), documented as a gap before being filled. Three event
  types left deliberately unwired (`PurchaseDeleted`/`SaleCancelled`/
  `ManufacturingStarted` — no corresponding implementation exists anywhere in the app).
- **Diagnostics & Observability Platform** (11C, `js/services/diagnostics/`) — passive
  `ALL_EVENTS` observation: structured logging, trace context (reuses the Event Bus's own
  context whitelist verbatim, adds one field, `correlationId`), five-category error
  classification, execution timeline, performance metrics, diagnostic report builder.
  Self-protected, never publishes, never mutates. Its own observer is constructed but
  deliberately never started anywhere in this checkpoint — zero live subscriber from 11C
  itself.
- **Background Job Engine** (11D, `js/services/jobs/`) — registry/contracts/lifecycle/
  dispatcher consuming Domain Events, reusing 11C's diagnostics factories and Trace
  Context rather than duplicating either. Three passive demonstration jobs. **Live**:
  `startBackgroundInfrastructure()` is called from each of 7 pages' own pre-existing
  `boot()` (after `requireAuth()` succeeds) — no new bootstrap framework, using the app's
  existing startup pattern. This is the one place this checkpoint changes application
  behavior beyond adding dormant infrastructure: background jobs are now genuinely
  running in production.

## Architecture Changes

Three new, fully self-contained platforms — `js/services/events/`, `js/services/diagnostics/`,
`js/services/jobs/` — each a sibling of `js/services/dataExchange/`, none nested inside
another, following the same barrel/module-map convention that platform already
established. Dependency direction is strictly one-way: `dataExchange/` now imports from
`events/` (6 files, 11B); `jobs/` imports from both `events/` and `diagnostics/`; nothing
in `dataExchange/`, `diagnostics/`, or any business file imports from `jobs/` except the
one, deliberate reverse direction 11D's own brief required (7 pages import
`startBackgroundInfrastructure`). No platform imports from a business file, and no
platform's internals were modified by a later one — `bus/eventBus.js` and
`contracts/eventEnvelope.js` (11A) are byte-for-byte unchanged by 11B/11C/11D; `diagnostics/`'s
logic is unmodified by 11D (only new instances of its factories were constructed).

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
| `ui/forms/forms.test.html` | 80/80 ✅ |
| **Total** | **756/756 ✅** |

Re-run directly against the tagged commit (`e407b8f`), via `python -m http.server` +
headless Chrome `--dump-dom`, the same zero-build-step harness convention every prior
milestone uses. No suite skipped, no suite modified for this checkpoint beyond the
verification pass itself. Every count independently reconciles against the per-milestone
math: `json-platform-v1.0`'s 475 (8 suites) → +21 new checks in 11B's six extended
suites = 496 → +58 (`eventBus.test.html`) +80 (`forms.test.html`, pre-existing but not
previously part of this running total) = 634 at 11B → +68 (`diagnostics.test.html`) = 702
at 11C → +54 (`jobEngine.test.html`) = 756 at 11D, this checkpoint. (11B's and 11C's own
report/release docs originally mis-summed these totals — 499, 682, and 736 respectively
— corrected as part of this checkpoint's verification pass; see those documents' own
"Update" notes.)

Additionally: `node --check` was run against every new/modified `.js` file across all
four milestones (confirmed clean), and the seven HTML pages' inline module scripts (11D)
were extracted and independently syntax-checked.

## Files changed (78 total: 53 added, 25 modified)

**Modified** (25 — zero lines removed anywhere, only additive `import`s + guarded calls):

- 18 pre-existing files, 11B: `js/purchases.js`, `js/sales.js`, `js/items.js`,
  `js/suppliers.js`, `js/manufacturing.js`, `js/supabaseClient.js`, and 12
  `dataExchange/` code + test files (`xmlImporter.js`, `xmlExporter.js`,
  `jsonImporter.js`, `jsonExporter.js`, `apnabillBackup.js`, `apnabillRestore.js`, plus
  the six suites those files' own tests live in).
- 7 pages, 11D: `menu.html`, `purchase.html`, `suppliers.html`, `stock.html`,
  `items.html`, `manufacturing.html`, `sale.html` — one import + one
  `startBackgroundInfrastructure()` call each, added to each page's own pre-existing
  `boot()`.

**Added** (53 — 41 code/test files, 12 docs):

- `js/services/events/` (11 files, 11A)
- `js/services/diagnostics/` (16 files, 11C)
- `js/services/jobs/` (14 files, 11D)
- `docs/` (12 files): 3 living architecture references
  (`event-bus-architecture.md`, `diagnostics-architecture.md`, `job-engine-architecture.md`),
  8 milestone design/report docs, 2 release checkpoints
  (`event-integration-v1.0.md`, `diagnostics-core-v1.0.md`) — plus this document, added
  in the same verification pass but counted separately below since it postdates the
  commit's own file list.

Full per-file purpose tables: see each milestone's own report doc (§3/§4 in each).

## Known Limitations

- **Three event types remain unpublished**: `PurchaseDeleted`, `SaleCancelled`,
  `ManufacturingStarted` — no corresponding business implementation exists anywhere in
  the app (11B).
- **No Core ERP test harness**: `purchases.js`/`sales.js`/`items.js`/`suppliers.js`/
  `manufacturing.js`/`supabaseClient.js` have no `.test.html` of their own; their 7
  `eventBus.publish()` call sites were verified by direct code review against real RPC
  return columns, not by an automated suite (11B).
- **`diagnosticsObserver` (11C) is still never started** — 11D deliberately reused
  diagnostics' factories via fresh instances instead of starting the shared observer; no
  whole-application event observation is live from 11C's own code.
- **No persistence** for job run history, diagnostics metrics, or logs — by design;
  the Audit Platform is the natural place for persistence, not built here.
- **No retry policy** anywhere in the Job Engine — explicitly out of scope.
- **`index.html`** was not wired to `startBackgroundInfrastructure()` — it does not call
  `requireAuth()` and sits outside the pattern the other 7 pages share.

## Technical Debt

- Formal per-event-type payload schemas (11B/11D) — `version` fields exist specifically
  to make this addable later without a bus change.
- Cross-subscriber failure visibility (11C design doc §7) — would require a future,
  opt-in Event Bus enhancement; not attempted, since the Event Bus is frozen per every
  milestone's own brief.
- Same carried-forward items as `json-platform-v1.0`: Purchase/Manufacturing/Stock/
  Settings entity coverage for JSON/XML, CSV/Excel import/export, Cloud Backup/Sync/
  Disaster Recovery Restore, promoting `apnabill/zip/crc32.js` to `shared/`.

None of the above are release blockers; all were already disclosed in each milestone's
own report at implementation time.

## Repository State

Verified directly as part of this checkpoint (2026-07-25), against tagged commit
`e407b8f`:

- **`git status --porcelain`**: clean at the time of tagging — the only files touched
  after the commit were this document and the corrections described below, applied and
  verified before tagging.
- **No generated, temporary, or debug artifact files** tracked anywhere in the repo.
- **No `TODO`/`FIXME` placeholders** introduced under `js/` by any of the four
  milestones.
- **No accidental `console.log`/`console.debug` calls** — each new platform's own
  designated, pluggable console sink (`events/shared/logging/consoleSink.js`,
  `diagnostics/logging/consoleSink.js`) is the only place `console` is called directly,
  by design.
- **No commented-out production code** in any file any of the four milestones touched.
- **All 53 added files are git-tracked**, matching the working tree exactly.
- **Documentation consistency pass** (this checkpoint): every regression total across
  `docs/milestone-11b-event-integration-report.md`, `docs/milestone-11c-diagnostics-report.md`,
  `docs/milestone-11d-job-engine-report.md`, `docs/releases/event-integration-v1.0.md`,
  and `docs/releases/diagnostics-core-v1.0.md` was independently recomputed from a fresh
  headless run and corrected where it had previously been mis-summed (11B: 499→634 and
  "24 new"→"21 new" and "fourteen of seventeen event types"→"twelve of fifteen"; 11C:
  682→702; 11D: 736→756 and "23 files"→"17 files"). Every stale "not yet committed"/
  "pending"/"no tag exists yet" reference in the two prior release checkpoints was
  updated to point at this commit and tag. Stale forward-guesses about milestone naming
  ("11D Audit" — 11D turned out to be the Job Engine) were corrected in the two living
  architecture references that still had them (`diagnostics-architecture.md`); the
  original milestone-specific design docs (11A's own design doc, 11C's own design doc)
  were left as point-in-time records of what was anticipated when they were written,
  not retroactively rewritten.
- **Tag `infrastructure-platform-v1.0`** exists, is annotated, and points at exactly
  `master`'s `e407b8f`.
- **No separate tags** exist for 11A, 11B, 11C, or 11D individually — by explicit
  instruction, all four ship under this one consolidated tag.

## Future Milestones

Per each platform's own living architecture reference:

- **The Audit Platform** — the natural next `ALL_EVENTS` subscriber (could start
  `diagnosticsObserver` for real, or subscribe independently the way 11D's dispatcher
  does); likely persists `describeError()`/`deriveTraceContextFromEvent()`-shaped
  records, and/or reads `jobDispatcher.getRunHistory()`.
- **A future Plugin Framework** — registers jobs and/or subscribers through the same
  public APIs any first-party caller already uses; no plugin-specific mechanism needed
  anywhere in these four platforms.
- **A future Diagnostics Dashboard** — calls `createDiagnosticReport()` periodically; no
  code change required to support it.
- Wiring `PurchaseDeleted`/`SaleCancelled`/`ManufacturingStarted` if/when their
  underlying business implementations are ever built.
- Formal per-event-type payload schemas, once a real subscriber needs one.
- Same carried-forward Data Exchange items as `json-platform-v1.0` (entity coverage,
  CSV/Excel, Cloud Backup/Sync, `crc32.js` promotion).

## Recommendation

The repository is clean at tag `infrastructure-platform-v1.0` (commit `e407b8f`), fully
regression-tested (756/756 across 12 suites), and every release/checkpoint document's
regression arithmetic and commit/tag references have been independently verified and
corrected where they were previously wrong. **The repository is ready for the next
architecture milestone** (most likely the Audit Platform or a Plugin Framework, per
every platform's own documented extension points).
