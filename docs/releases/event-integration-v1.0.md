# Release: event-integration-v1.0

**Tag:** not yet created · **Commit:** pending (working tree, base `9569e9d` on
`master`) · **Date:** 2026-07-25

This is a release checkpoint document, not a design document. It records the state of
the repository as of this checkpoint for anyone picking up work afterward. Unlike the
prior `json-platform-v1.0` checkpoint, this one is written **before** the milestone's
changes are committed or tagged — the user deferred that step; the commit and the
`event-integration-v1.0` tag are still to be created. For design rationale and
build/verification detail, see `docs/milestone-11a-event-bus-design.md`,
`docs/event-bus-architecture.md`, and `docs/milestone-11b-event-integration-report.md`
— not repeated here.

## Release Summary

Milestones 11A (Domain Event Bus infrastructure) and 11B (Domain Event Integration) are
implemented, tested, and documented, but **not yet committed to `master`**. They add
ApnaBill's internal, synchronous, in-process Domain Event Bus, and wire it into 14 of 17
registered event types across the real ERP and Data Exchange platform. No database
schema change, no public API change, no network/cloud functionality, no UI change, no
workflow change, and no change to any existing function's parameters, return shape, or
error behavior — every wired call site is an additive `import` + one guarded
`eventBus.publish()` call at an already-existing success point. Full regression:
**499/499 passing** (475 carried over unmodified from `json-platform-v1.0` + 24 new).

## Major Features

- **Domain Event Bus** (`js/services/events/`, Milestone 11A) — a lightweight,
  deterministic, synchronous, framework-independent internal event bus: envelope
  (`contracts/eventEnvelope.js`), registry (`registry/eventTypes.js`, the single source
  of truth for event type strings), bus (`bus/eventBus.js`, publish/subscribe/
  unsubscribe/`ALL_EVENTS` wildcard, per-subscriber error isolation), and optional
  context (`context/eventContext.js`). No external dependencies; owns its own copies of
  the deep-freeze and sink-injected-logging primitives rather than reaching into
  `dataExchange/shared/`.
- **Domain Event Integration** (Milestone 11B) — every registered event type except
  three with no matching implementation (`PurchaseDeleted`, `SaleCancelled`,
  `ManufacturingStarted` — all documented, none fabricated) is now published from its
  real success point: `CompanyChanged`, `CustomerCreated`, `SupplierCreated`,
  `ItemCreated`, `PurchaseCreated`, `SaleCreated`, `StockAdjusted`,
  `ManufacturingCompleted` in Core ERP; `ImportCompleted`/`ExportCompleted` (XML and
  JSON), `BackupCreated`, and the newly-registered `RestoreCompleted` in the Data
  Exchange platform.
- **One registry addition**: `RestoreCompleted` — Restore had no matching event in
  11A's seed catalog; the gap was documented, then filled additively (one contract
  entry; zero changes to `bus/eventBus.js` or `contracts/eventEnvelope.js`).
- **Zero subscribers** — this is publish-only infrastructure and integration. Nothing in
  the app reacts to any event yet; that is explicitly deferred to 11C (Diagnostics), 11D
  (Audit), 11E (Plugin System), and any future Background Jobs milestone.

## Architecture Changes

**11A**: one new, fully self-contained platform, `js/services/events/`, sibling to
`js/services/dataExchange/` (not nested inside it) — confirmed by `git status` showing
it as the only new top-level addition at that milestone. Zero changes to any existing
file.

**11B**: no architectural redesign — confirmed by `git status --porcelain` showing every
changed file as a pre-existing one, none renamed or restructured, plus one new file
(`js/services/events/registry/eventTypes.js`'s only change is the additive
`RESTORE_COMPLETED` entry). The only structural fact worth recording: `dataExchange/`
(previously zero-dependency on anything outside itself, `shared/`, and its own
subfolders) now imports from `services/events/` in six files
(`xmlImporter.js`, `xml/export/xmlExporter.js`, `json/import/jsonImporter.js`,
`json/export/jsonExporter.js`, `apnabill/apnabillBackup.js`,
`apnabill/apnabillRestore.js`) — a dependency direction 11A's own design doc §4
anticipated and endorsed in advance ("`events/` is meant to be a dependency of
`dataExchange/` eventually... never the reverse").

## Regression Status

| Suite | Result |
|---|---|
| `dataExchange.test.html` (9A) | 43/43 ✅ |
| `xmlImport.test.html` (9B + 11B) | 87/87 ✅ (83 baseline + 4 new) |
| `xmlExport.test.html` (9C + 11B) | 77/77 ✅ (74 baseline + 3 new) |
| `apnabill.test.html` (9D + 11B) | 52/52 ✅ (49 baseline + 3 new) |
| `apnabillRestore.test.html` (9E + 11B) | 72/72 ✅ (69 baseline + 3 new) |
| `migration.test.html` (9F) | 48/48 ✅ |
| `json/jsonExport.test.html` (10 + 11B) | 58/58 ✅ (54 baseline + 4 new) |
| `json/jsonImport.test.html` (10 + 11B) | 59/59 ✅ (55 baseline + 4 new) |
| `events/eventBus.test.html` (11A/11B) | 58/58 ✅ (catalog check updated, not added) |
| `ui/forms/forms.test.html` | 80/80 ✅ |
| **Total** | **499/499 ✅** (475 + 24 new) |

Re-run headlessly against the current working tree (`python -m http.server` + Chrome
`--headless=new --dump-dom`), the same zero-build-step harness convention every prior
milestone uses. Every baseline count matches `json-platform-v1.0` exactly; every increase
matches exactly the new checks §"New test coverage" in the 11B report describes. No
suite skipped, no suite modified beyond the additive checks documented there.

## Known Limitations

- Core ERP files with new publish calls (`purchases.js`, `sales.js`, `items.js`,
  `suppliers.js`, `manufacturing.js`, `supabaseClient.js`) have **no automated test
  harness at all** — confirmed before 11B began and unchanged by it (no
  `purchases.test.html` etc. exists anywhere). Those seven call sites were verified by
  direct code review against the real RPC return columns, not by an automated suite —
  disclosed in the 11B report, not hidden.
- No event payload has a formal, validated schema — payloads are informally shaped
  per event type (see 11B report §"Payload philosophy"). `version` exists on every
  envelope specifically so this can be added later without a bus change.
- `PurchaseDeleted`, `SaleCancelled`, `ManufacturingStarted` remain registered but
  unpublished — no corresponding implementation exists anywhere in the app (11B report
  §"Registry gaps left unwired").
- Zero subscribers exist. The bus and its wiring are fully inert in production until a
  future milestone adds the first one.

## Technical Debt

- Same JSON/XML entity-scope and `crc32.js` items carried forward unchanged from
  `json-platform-v1.0` (still open, unaffected by 11A/11B).
- Formal per-event-type payload schemas, once a real subscriber needs one.
- The three unwired registry entries (§"Known Limitations") — wire them only if/when a
  real delete-purchase/cancel-sale/multi-phase-manufacturing implementation exists;
  never before that.

None of the above are release blockers; all were already disclosed in
`docs/milestone-11a-event-bus-report.md` and `docs/milestone-11b-event-integration-report.md`
at implementation time.

## Repository State

Verified directly as part of this checkpoint (2026-07-25), against the **working tree**,
not a committed/tagged ref (see header):

- **`git status --porcelain`**: 22 entries — 18 modified files (all traced in the 11B
  report §"Files modified"), 4 new/untracked doc files
  (`docs/event-bus-architecture.md`, `docs/milestone-11a-event-bus-design.md`,
  `docs/milestone-11a-event-bus-report.md`, `docs/milestone-11b-event-integration-report.md`),
  plus the new `js/services/events/` directory. **Nothing is committed yet** — this is
  the one material difference from every prior release checkpoint in this repository,
  which all documented a clean, already-merged `master`.
- **No generated, temporary, or debug artifact files** among the new/changed files
  (`.tmp`/`.bak`/`.orig`/scratch files: none found).
- **No `TODO`/`FIXME` placeholders** added anywhere under `js/` by this work.
- **No accidental `console.log`/`console.debug` calls** — the events module's own
  `shared/logging/consoleSink.js` is the one pluggable sink implementation calling
  `console` directly, by design, same convention `dataExchange/shared/logging/` already
  established.
- **No commented-out production code** in any file this work touched.
- **Every file this work added is present on disk and matches what the 11A/11B reports
  describe** — cross-checked file-by-file while writing this document.
- **No tag exists yet** for `event-integration-v1.0` — by the user's explicit choice this
  checkpoint documents the pre-commit state; creating the commit(s) and the annotated
  tag is a separate, deferred step.

## Future Milestones

Per `docs/event-bus-architecture.md` §9 and `docs/milestone-11b-event-integration-report.md`
§"Registry gaps left unwired", still open and unaffected by this checkpoint:

- 11C Diagnostics, 11D Audit, 11E Plugin System, and any future Background Jobs
  milestone — the first real subscribers to this bus.
- Wiring `PurchaseDeleted`/`SaleCancelled`/`ManufacturingStarted` if/when their
  underlying implementations are ever built.
- Formal per-event-type payload schemas.
- Same carried-forward items as `json-platform-v1.0`: Purchase/Manufacturing/Stock/
  Settings entity coverage for JSON/XML, CSV/Excel import/export, Cloud Backup/Sync/
  Disaster Recovery Restore, promoting `apnabill/zip/crc32.js` to `shared/`.

## Recommendation

The implementation is complete, fully regression-tested against the working tree, and
contains no uncommitted debug/generated artifacts beyond the intended source and doc
changes themselves. The one open item is procedural, not technical: **commit the 22
pending files and create the `event-integration-v1.0` tag whenever the user is ready** —
nothing about the code or docs blocks that step. Once committed and tagged, this
document's header (Tag/Commit fields) should be updated to match, the same way
`json-platform-v1.0.md` records its own final commit hash.
