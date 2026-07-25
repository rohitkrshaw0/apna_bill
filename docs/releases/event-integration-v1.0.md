# Release: event-integration-v1.0

**Tag:** none, by design — consolidated under `infrastructure-platform-v1.0` (see note
below) · **Commit:** `e407b8f` (`master`) · **Date:** 2026-07-25

This is a release checkpoint document, not a design document. It records Milestones 11A
and 11B's own scope for anyone picking up work afterward. **Update (post-commit):**
11A and 11B were ultimately committed together with 11C (Diagnostics) and 11D (Background
Job Engine) as one single, deliberate commit, `e407b8f` — no separate
`event-integration-v1.0` tag was created for this scope alone, by explicit instruction.
The authoritative, complete release record for all four milestones is
`docs/releases/infrastructure-platform-v1.0.md`, tagged `infrastructure-platform-v1.0`;
this document is retained as the detailed, point-in-time record of 11A/11B's own design
and verification, referenced from that consolidated checkpoint rather than repeating its
content. For design rationale and build/verification detail, see
`docs/milestone-11a-event-bus-design.md`, `docs/event-bus-architecture.md`, and
`docs/milestone-11b-event-integration-report.md` — not repeated here.

## Release Summary

Milestones 11A (Domain Event Bus infrastructure) and 11B (Domain Event Integration) add
ApnaBill's internal, synchronous, in-process Domain Event Bus, and wire it into 12 of 15
registered event types across the real ERP and Data Exchange platform (14 physical call
sites — some event types are published from more than one file; see
`docs/milestone-11b-event-integration-report.md` §"Payload philosophy"). No database
schema change, no public API change, no network/cloud functionality, no UI change, no
workflow change, and no change to any existing function's parameters, return shape, or
error behavior — every wired call site is an additive `import` + one guarded
`eventBus.publish()` call at an already-existing success point. Full regression at this
scope: **634/634 passing** — the eight pre-11B suites' combined count went from 475 (their
`json-platform-v1.0` baseline) to 496 (21 new checks across the six suites 11B extended),
plus the wholly-new `eventBus.test.html` (58) and the pre-existing, unrelated
`forms.test.html` (80): 496 + 58 + 80 = 634.

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
  the app reacts to any event yet at this scope; 11C (Diagnostics, built but unstarted)
  and 11D (Background Job Engine, built and live) shipped afterward in the same commit —
  see `docs/releases/infrastructure-platform-v1.0.md`.

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
| **Total** | **634/634 ✅** (496 across the 8 pre-11B suites [475 baseline + 21 new] + 58 `eventBus.test.html` + 80 `forms.test.html`) |

Re-run headlessly (`python -m http.server` + Chrome `--headless=new --dump-dom`) as part
of the consolidated `infrastructure-platform-v1.0` verification pass against commit
`e407b8f` — see that checkpoint for the full, current 12-suite/756-check total including
11C and 11D. Every baseline count matches `json-platform-v1.0` exactly; every increase
matches exactly the new checks §"New test coverage" in the 11B report describes (21, not
24 — corrected from this document's original draft, which mis-summed the per-suite
table). No suite skipped, no suite modified beyond the additive checks documented there.

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

Verified at commit `e407b8f`:

- 18 modified files (all traced in the 11B report §"Files modified"), plus the new
  `js/services/events/` directory and the 11A/11B doc files — all committed together with
  11C's and 11D's own files in this one commit (see
  `docs/releases/infrastructure-platform-v1.0.md` for the complete file inventory).
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

## Future Milestones

Per `docs/event-bus-architecture.md` §9 and `docs/milestone-11b-event-integration-report.md`
§"Registry gaps left unwired" — updated to reflect what has since shipped:

- 11C Diagnostics (done, unstarted observer) and 11D Background Job Engine (done, live)
  — see `docs/releases/infrastructure-platform-v1.0.md`.
- The Audit Platform, a Plugin Framework — still open, the natural next subscribers.
- Wiring `PurchaseDeleted`/`SaleCancelled`/`ManufacturingStarted` if/when their
  underlying implementations are ever built.
- Formal per-event-type payload schemas.
- Same carried-forward items as `json-platform-v1.0`: Purchase/Manufacturing/Stock/
  Settings entity coverage for JSON/XML, CSV/Excel import/export, Cloud Backup/Sync/
  Disaster Recovery Restore, promoting `apnabill/zip/crc32.js` to `shared/`.

## Recommendation

11A/11B shipped as part of commit `e407b8f`, tagged `infrastructure-platform-v1.0`
together with 11C and 11D. This document's own regression numbers and event-type/call-site
counts were corrected during that consolidation pass (previously mis-summed — see
"Release Summary" and "Regression Status" above) to match the verified current state. No
further action is needed against this document; see
`docs/releases/infrastructure-platform-v1.0.md` for the authoritative, complete record.
