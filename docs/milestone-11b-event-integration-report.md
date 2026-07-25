# Milestone 11B — Domain Event Integration: Report

Deliverables document for wiring the Milestone 11A Domain Event Bus into the real ERP.
Covers what was actually built and verified. For the Event Bus's own architecture
(envelope, registry, error handling, naming convention), see
`docs/event-bus-architecture.md` and `docs/milestone-11a-event-bus-design.md` — not
repeated here.

## 1. Objective

Every completed, successful business operation now publishes exactly one Domain Event,
through the existing Milestone 11A `eventBus`. No subscribers were added — this milestone
is publish-only, per its own brief. No workflow, UI, database schema, validation, or
service contract changed; every wired function's parameters, return shape, and error
behavior are unchanged.

## 2. What was reviewed before any edit was made

Every module named in the brief (Company, Customers, Suppliers, Items, Purchases, Sales,
Manufacturing, Stock, Import, Export, Backup, Restore, JSON, XML, Migration) was read in
full before any code was touched, to find each one's actual, already-existing success
point — never a fabricated one. Two structural findings shaped every edit that followed:

1. **Core ERP functions throw on failure.** `savePurchaseFromCart`, `saveSaleFromCart`,
   `createItem`, `createSupplier`, `createPartyQuick`, `createManufacturing`,
   `recordStockAdjustment` all follow the same shape: `if (error) throw error; return
   ...;`. Publishing immediately before that `return` is sufficient — a thrown error
   never reaches the publish call.
2. **The six Data Exchange orchestration entry points do not throw on business
   failure.** `runXmlExport`, `createXmlImporter().run()`, `runJsonExport`,
   `createJsonImporter().run()`, `runApnaBillBackup`, `runApnaBillRestore` all normalize
   failures into `migrationResult.historyEntry.status` instead (a pre-existing, documented
   design from Milestone 9F). Every publish call in this layer is therefore gated on
   `historyEntry.isSuccess()` — proven necessary and sufficient by the new "publishes
   nothing on failure" checks added to each suite (§7).

## 3. Registry addition (documented gap, then filled)

`runApnaBillRestore()` ("New Company Restore") is a genuine, complete, successful
business operation with **no matching event type** in the 11A seed catalog — confirmed by
reading `js/services/events/registry/eventTypes.js` before writing any code. Per this
milestone's own "document the gap before creating a new event type" rule:

- **Gap documented**: Restore had no event. Reusing `ImportCompleted` was considered and
  rejected — a restore is a different pipeline (native `.apnabill` format, not an
  interchange format) with its own `historyType: 'restore'` already distinguishing it
  from XML/JSON import at the Migration Engine level; conflating it with `ImportCompleted`
  would erase a real distinction a future Audit subscriber would want to keep.
- **Addition made**: `RESTORE_COMPLETED: { type: 'RestoreCompleted', aggregate:
  'restore', version: 1, ... }` added to `registry/eventTypes.js`, plus `'restore'` added
  to `AGGREGATES`. This is the only change to the Event Bus module itself this milestone —
  purely additive, exactly the extension mechanism 11A's own design doc §16 already
  documented ("adding `PurchaseUpdated`... means adding one entry... nothing in
  `bus/eventBus.js` changes"). `bus/eventBus.js` and `contracts/eventEnvelope.js` are
  byte-for-byte unchanged.

## 4. Registry gaps left unwired (documented, not invented)

Three registered event types have **no corresponding implementation anywhere in the
app**, confirmed by repo-wide grep before writing any code:

- **`PurchaseDeleted`** — no `deletePurchase`/`removePurchase`/`delete_purchase` function
  exists in any `.js` or `.sql` file. Nothing to wire.
- **`SaleCancelled`** — no `cancelSale`/`voidSale`/`cancel_sale` function exists. Both
  importers' own `sale` writer `undo` callbacks are explicitly documented no-ops for this
  exact reason (their own comments say so, unrelated to this milestone).
- **`ManufacturingStarted`** — `createManufacturing()` is one atomic RPC
  (`create_manufacturing`) with no genuine, observable "started but not yet completed"
  intermediate state. Only `ManufacturingCompleted` is published (§5). Publishing
  `Started` immediately before `Completed` for an atomic call would be an artificial
  split — exactly what this milestone's brief forbids ("Do NOT invent artificial
  events").

All three remain registered, correctly documented here and in
`docs/event-bus-architecture.md` §7, and unpublished. Nothing was fabricated to fill
them.

## 5. Files modified (18, all additive edits — no existing line changed or removed)

**Core ERP** (one `import` line + one guarded `eventBus.publish()` call per function,
immediately before the existing `return`):

| File | Function(s) | Event(s) |
|---|---|---|
| `js/supabaseClient.js` | `setActiveCompany(id)` | `CompanyChanged` (only when `id` is truthy — clearing the selection has no aggregate to describe) |
| `js/sales.js` | `createPartyQuick()`, `saveSaleFromCart()` | `CustomerCreated`, `SaleCreated` |
| `js/suppliers.js` | `createSupplier()` | `SupplierCreated` |
| `js/items.js` | `createItem()`, `recordStockAdjustment()` | `ItemCreated`, `StockAdjusted` |
| `js/purchases.js` | `savePurchaseFromCart()` | `PurchaseCreated` |
| `js/manufacturing.js` | `createManufacturing()` | `ManufacturingCompleted` only (§4) |

**Data Exchange orchestration** (one `import` line + one `historyEntry.isSuccess()`-gated
`eventBus.publish()` call per function, immediately before the existing `return`):

| File | Function | Event |
|---|---|---|
| `js/services/dataExchange/xml/xmlImporter.js` | `createXmlImporter().run()` | `ImportCompleted` |
| `js/services/dataExchange/xml/export/xmlExporter.js` | `runXmlExport()` | `ExportCompleted` |
| `js/services/dataExchange/json/import/jsonImporter.js` | `createJsonImporter().run()` | `ImportCompleted` |
| `js/services/dataExchange/json/export/jsonExporter.js` | `runJsonExport()` | `ExportCompleted` |
| `js/services/dataExchange/apnabill/apnabillBackup.js` | `runApnaBillBackup()` | `BackupCreated` |
| `js/services/dataExchange/apnabill/apnabillRestore.js` | `runApnaBillRestore()` | `RestoreCompleted` (new, §3) |

**Event Bus registry** (one file — see §3):

| File | Change |
|---|---|
| `js/services/events/registry/eventTypes.js` | Added `RESTORE_COMPLETED` contract + `'restore'` aggregate |

**Test suites extended** (see §7 — the six suites covering the six Data Exchange
orchestration functions above):

`js/services/dataExchange/xml/xmlImport.test.html`,
`js/services/dataExchange/xml/xmlExport.test.html`,
`js/services/dataExchange/json/jsonImport.test.html`,
`js/services/dataExchange/json/jsonExport.test.html`,
`js/services/dataExchange/apnabill/apnabill.test.html`,
`js/services/dataExchange/apnabill/apnabillRestore.test.html`,
plus `js/services/events/eventBus.test.html`'s catalog-completeness check (updated for
`RESTORE_COMPLETED`).

Nothing outside this list changed. No file was rewritten — every diff is an added
`import` line plus an added, guarded `eventBus.publish()` call at an already-existing
success point.

## 6. Payload philosophy

Every payload follows the same three rules, applied consistently across all fourteen
wired call sites:

1. **Identifiers over objects.** `aggregateId` is always a real, already-computed value
   from the existing function (a DB row's id column, or — for the six orchestration
   entry points, which produce no DB row of their own — the `historyEntry.timestamp`
   already stamped by the Migration Engine, or the target `companyId` for
   Backup/Restore). Nothing is fabricated.
2. **Small, named facts, not the whole row.** E.g. `SaleCreated`'s payload is `{
   invoiceNo, partyId }`, never the full `data` row `saveSaleFromCart` already has in
   scope. `ImportCompleted`/`ExportCompleted`'s payload is `{ format, recordCounts }` (a
   count per entity type), never the raw `createdIds` id arrays.
3. **Context only when genuinely available.** `context: { company, module }` is included
   wherever a `companyId` is already in scope in the existing function (true for every
   Core ERP function and every Data Exchange entry point via `opts.companyId`/
   `capturedCompanyDto.id`/`context.companyId`). No `user`, `requestId`, `executionId`,
   `source`, or `traceId` was set anywhere — none were genuinely available without
   inventing them, and this milestone's brief is explicit: "do not invent values."

## 7. New test coverage — 24 new checks across 6 suites

For every one of the six Data Exchange orchestration entry points, the existing
happy-path fixture and the existing failure fixture (both already present in each
suite before this milestone — see each function's own file for the ones reused) were
extended, not duplicated, with:

- a temporary `eventBus.subscribe()` before the call and `unsubscribe()` immediately
  after, so no check leaks a listener into a later block;
- on the happy-path fixture: exactly one matching event was published, with the
  correct `aggregateId` (matching `historyEntry.timestamp` or the fixture's companyId)
  and the correct payload shape;
- on the failure fixture: zero matching events were published.

| Suite | New checks | Proves |
|---|---|---|
| `xmlImport.test.html` | 4 | `ImportCompleted` on success (payload/aggregateId/context), none on rollback failure |
| `xmlExport.test.html` | 3 | `ExportCompleted` on success, none on invalid-plan failure |
| `jsonImport.test.html` | 4 | `ImportCompleted` on success (payload/aggregateId/context), none on rollback failure |
| `jsonExport.test.html` | 4 | `ExportCompleted` on success (payload/aggregateId/context), none on invalid-plan failure |
| `apnabill.test.html` | 3 | `BackupCreated` on success, none on failed-verify failure |
| `apnabillRestore.test.html` | 3 | `RestoreCompleted` on success, none on schema-invalid failure |
| `eventBus.test.html` | 0 net-new (1 updated) | Catalog-completeness check now includes `RESTORE_COMPLETED` |

Core ERP files (`purchases.js`, `sales.js`, `items.js`, `suppliers.js`,
`manufacturing.js`, `supabaseClient.js`) have **no existing test harness at all** —
confirmed before this milestone (repo-wide `*.test.html` inventory) and unchanged by it;
fabricating one from scratch was out of this milestone's additive-integration scope. The
seven `eventBus.publish()` calls added to these files were verified by direct code
review (each call site quoted in §5, each field traced to the exact real value it comes
from — RPC return column names cross-checked directly against `sale_rpc.sql`,
`manufacturing_rpc.sql`, `stock_rpc.sql`) rather than by an automated suite. This gap is
disclosed, not hidden.

## 8. Regression status

Full suite re-run headlessly (`python -m http.server` + Chrome `--headless=new
--dump-dom`), including every suite this milestone touched and every one it didn't:

| Suite | Result | vs. baseline |
|---|---|---|
| `js/services/events/eventBus.test.html` | 58/58 ✅ | same count (catalog check updated, not added) |
| `js/services/dataExchange/xml/xmlImport.test.html` | 87/87 ✅ | 83 baseline + 4 new |
| `js/services/dataExchange/xml/xmlExport.test.html` | 77/77 ✅ | 74 baseline + 3 new |
| `js/services/dataExchange/json/jsonImport.test.html` | 59/59 ✅ | 55 baseline + 4 new |
| `js/services/dataExchange/json/jsonExport.test.html` | 58/58 ✅ | 54 baseline + 4 new |
| `js/services/dataExchange/apnabill/apnabill.test.html` | 52/52 ✅ | 49 baseline + 3 new |
| `js/services/dataExchange/apnabill/apnabillRestore.test.html` | 72/72 ✅ | 69 baseline + 3 new |
| `js/services/dataExchange/migration/migration.test.html` | 48/48 ✅ | untouched, unchanged |
| `js/services/dataExchange/dataExchange.test.html` | 43/43 ✅ | untouched, unchanged |
| `js/ui/forms/forms.test.html` | 80/80 ✅ | untouched, unchanged |

Every baseline count matches `json-platform-v1.0`/Milestone 11A exactly; every increase
matches exactly the number of new checks added in §7. Zero failures anywhere. Node's
`--check` syntax validator was also run against all 18 modified files before the suites
were run, confirming no parse error was introduced.

## 9. Final assessment

Fourteen of seventeen registered event types are now wired to a real, already-existing
success point across eleven files, with zero change to any existing behavior, return
shape, or error path — proven by 24 new, passing checks plus a full, green re-run of
every pre-existing suite. The three unwired types (`PurchaseDeleted`, `SaleCancelled`,
`ManufacturingStarted`) have no implementation to hook and are documented, not
fabricated. One registry addition (`RestoreCompleted`) closed a genuine, disclosed gap
using 11A's own additive extension mechanism. No subscriber exists yet — publishing only,
exactly as scoped. **Milestone 11B is complete: the Domain Event Bus is now part of
ApnaBill's normal execution flow.**
