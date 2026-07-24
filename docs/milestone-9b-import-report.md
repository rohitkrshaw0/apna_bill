# Milestone 9B — XML Import Engine: Import Report

Deliverables document for the Tally-XML import engine built on top of Milestone 9A's
Data Exchange Platform. Covers the spec's required items 2–7 (item 1, the mapping
document, is `docs/milestone-9b-xml-mapping.md`, produced before implementation began).

## 1. What was built

`js/services/dataExchange/xml/` — a new, self-contained subtree, zero existing files
modified (see "Zero-modification discipline" below):

```
xml/
  security/xmlSecurity.js          DOCTYPE/ENTITY rejection, file-size cap, .xml check
  encoding/detectEncoding.js       BOM sniff (UTF-8/UTF-16 LE/BE) + TextDecoder
  tallyXmlParser.js                IDataParser implementation (native DOMParser)
  mapping/
    parseHelpers.js                 shared quirks: &#4;-strip, "num unit"/"num/unit" split, date parse
    stateCodes.js                   GST state-name -> 2-digit-code lookup
    groupClassifier.js              LEDGER PARENT-chain -> customer/supplier/unsupported
    masters/companyMapper.js         COMPANY -> companyDTO (confirmation-only)
    masters/itemMapper.js             STOCKITEM -> itemDTO
    masters/partyMapper.js             LEDGER -> customerDTO/supplierDTO/unsupported
    vouchers/voucherDispatcher.js       VCHTYPE -> handler registry
    vouchers/salesVoucherMapper.js       VOUCHER (Sales) -> saleDTO
  validators/xmlBusinessRules.js    rule functions for 9A's validation stages
  conflicts/xmlConflictDetectors.js  duplicate item/ledger/invoice detectors
  writers/openingBalanceWriter.js     NEW: parties.opening_balance + current_balance
  writers/openingStockWriter.js        NEW: calls record_opening_stock RPC
  xmlImporter.js                       buildXmlImportPlan() + createXmlImporter() (IImporter)
  index.js                             barrel
  __fixtures__/sample-{master,voucher}.xml   synthetic, committed test fixtures
  xmlImport.test.html                  offline test harness (83 checks)

xml_import_rpc.sql                  new, additive SQL — NOT YET APPLIED to Supabase (see below)
```

`xmlImporter.js` is an adapter layer, not a second business-logic implementation:
`createItem()` (items.js), `createPartyQuick()`/`saveSaleFromCart()` (sales.js), and
`createSupplier()` (suppliers.js) are called exactly as they exist today. The only
genuinely new write logic is `openingBalanceWriter.js`/`openingStockWriter.js` +
`record_opening_stock`, because no reusable implementation of "write an opening
balance/stock value" existed anywhere in the app before this milestone.

All real business-service imports (`items.js`/`sales.js`/`suppliers.js`, which pull in
`supabaseClient.js` and its remote Supabase-SDK CDN import) are loaded **dynamically**,
only inside the default writers, only if a caller doesn't supply its own writers. This
keeps every other part of `xml/` — parsing, mapping, validation, conflict detection,
preview, planning — loadable with zero network access, which is what makes
`xmlImport.test.html` genuinely offline.

## 2. Supported XML coverage

Master file (`REPORTNAME = "All Masters"`):

| Tag | Status | Notes |
|---|---|---|
| `COMPANY` | Supported (confirmation-only) | Never creates/modifies a company — see decision 1 in the plan |
| `STOCKITEM` | Supported | -> `itemDTO` |
| `LEDGER` | Supported, conditionally | -> `customerDTO`/`supplierDTO` if under Sundry Debtors/Creditors; otherwise ignored with a warning |
| `GROUP` | Consulted only | Never becomes a DTO; resolves LEDGER classification |
| `UNIT` | Consulted only | No units master table in ApnaBill |
| `CURRENCY`, `COSTCATEGORY`, `INCOMETAXCLASSIFICATION`, `INCOMETAXSLAB`, `TAXUNIT`, `VOUCHERTYPE`, `GODOWN` | Known, unsupported | Collected as a warning, safely skipped |
| Any other tag | Unrecognized | Collected as a warning, safely skipped (never crashes) |

Voucher file (`REPORTNAME = "Vouchers"`):

| `VCHTYPE` | Status |
|---|---|
| `Sales` | Supported -> `saleDTO`, via `saveSaleFromCart()` |
| Anything else (Purchase/Manufacturing/Payment/Receipt/Journal/...) | Unsupported — dispatcher returns `{supported:false}`, a clear warning is raised, never a guess at structure |

Full per-entity field mapping tables (which XML field maps to which DTO field, and why)
are in `docs/milestone-9b-xml-mapping.md` sections 3.1–3.6 — not duplicated here.

## 3. Scope & Intentional Limitations

- The XML importer imports **only business entities that have a valid representation in
  ApnaBill**: items (`STOCKITEM`), customers/suppliers (`LEDGER` under Sundry
  Debtors/Creditors), opening balances and opening stock, and supported vouchers
  (currently `Sales`).
- The importer **intentionally ignores Tally's Chart of Accounts / General Ledger
  entries** — every other `LEDGER` record (system/accounting ledgers such as `Cash`,
  `Sales`, `Purchase`, `CGST`/`SGST`/`IGST`, `Discount (...)`, `Round Off (...)`,
  `Shipping & Packing (...)`, `Packaging (...)`, `Adjustment (...)`, `Profit & Loss A/c`)
  — because **ApnaBill does not implement a General Ledger subsystem**. There is no
  table, column, or concept anywhere in `schema.sql` for a standalone ledger/chart-of-
  accounts entry; ApnaBill computes GST, discounts, and round-off inline per document
  instead of posting them to named accounts.
- This is an **intentional architectural decision, made and documented before
  implementation began** (`docs/milestone-9b-xml-mapping.md` §3.5), not a parser
  limitation or a defect discovered afterward.
- Therefore, ignoring those 29 ledger accounts in the real supplied `master.xml` **does
  not represent data loss for any feature ApnaBill currently supports** — none of the 29
  hold a customer, supplier, item, or transaction; they are Tally's own bookkeeping
  accounts, and the values that would ever post to them are already captured elsewhere
  (GST rates per item via `GSTDETAILS.LIST`, discount per invoice line via
  `ALLINVENTORYENTRIES.LIST.DISCOUNT`).
- The **only** documented reconciliation nuance is **Round Off**: ApnaBill recomputes
  each invoice's round-off from `buildInvoiceMath()` (rate × qty × GST, rounded per
  ApnaBill's own rule) rather than preserving Tally's stored `Round Off (...)` ledger
  posting. Same underlying math, so in practice this should match, but a **±₹0.01
  difference is possible in rare cases** where Tally's per-voucher rounding and
  ApnaBill's recomputation land on different sides of a half-paise boundary.

| Imported entities | Ignored entities | Reason | Data-loss impact |
|---|---|---|---|
| `STOCKITEM` → items (26 of 26 in the real file) | — | n/a | n/a |
| `LEDGER` under Sundry Debtors/Creditors → customers/suppliers (1 of 30 in the real file) | Other 29 `LEDGER` records (Chart of Accounts: `Cash`, `Sales`, `Purchase`, `Credit Note`, `Debit Note`, `CGST`/`SGST`/`IGST`, `Profit & Loss A/c`, and the `Discount`/`Round Off`/`Shipping & Packing`/`Packaging`/`Adjustment` family × 4 voucher types each) | ApnaBill has no General Ledger / chart-of-accounts subsystem to hold a ledger-account record | None for supported features — these aren't business records (no customer/supplier/item/transaction) |
| `STOCKITEM.OPENINGBALANCE` / `BATCHALLOCATIONS.LIST` → opening stock (`record_opening_stock`) | — | n/a | n/a |
| `LEDGER.OPENINGBALANCE` → `parties.opening_balance` | — | n/a | n/a |
| `VOUCHER VCHTYPE="Sales"` → invoices | `VCHTYPE` values other than `Sales` (Purchase/Manufacturing/Payment/Receipt/Journal) | Not present in the supplied `voucher.xml`; dispatcher registry is ready for a handler, but none was built to avoid inventing unverified structure | None in the supplied data (all 16 vouchers are `Sales`); would only matter for a future file that actually contains other voucher types |
| Per-line discount (`ALLINVENTORYENTRIES.LIST.DISCOUNT`) and per-item GST rate (`GSTDETAILS.LIST`) | Voucher-level `Discount (...)`, `Round Off (...)`, `CGST`/`SGST`/`IGST` ledger *postings* | These are Tally's double-entry posting accounts for values ApnaBill already captures directly, not additional data | None, except **Round Off**: recomputed rather than transcribed — ±₹0.01 possible in rare cases (see above) |

## 4. Validation rules (`xmlBusinessRules.js`)

| Rule | Stage | Checks |
|---|---|---|
| `requiredFieldsRule` | business | item name/unit, party name, sale invoiceNo/invoiceDate/lines |
| `dateFormatRule` | business | sale `invoiceDate` must be `YYYY-MM-DD` |
| `quantitySplitRule` | business | RATE ("num/unit") and ACTUALQTY/BILLEDQTY ("num unit") parsed successfully |
| `gstRateCrossCheckRule` | business | Central+State Tax sum vs Integrated Tax; GSTAPPLICABLE="Not Applicable" vs a present non-zero rate |
| `ledgerBalanceRule` | business | voucher LEDGERENTRIES.LIST amounts sum near zero (informational; real Tally data routinely doesn't, since the per-line "Sales" revenue posting lives outside top-level LEDGERENTRIES.LIST — see `docs/milestone-9b-xml-mapping.md` §3.6) |
| `referencedEntitiesRule` | reference | every sale line's STOCKITEMNAME resolves to a known (already-existing or same-batch) item |

Conflict detectors (`xmlConflictDetectors.js`): duplicate item name, duplicate ledger
name (customer or supplier), duplicate invoice number — each checks against
caller-supplied "existing records" arrays (direct reads against the active company in
real use; injected fixtures in tests).

## 5. Test results

`xmlImport.test.html` — **83/83 checks passed**, run headlessly:

```
python -m http.server 8743
chrome --headless=new --disable-gpu --virtual-time-budget=8000 --dump-dom \
  http://localhost:8743/js/services/dataExchange/xml/xmlImport.test.html
```

Coverage: security (DOCTYPE/ENTITY/oversize/extension rejection), encoding (UTF-8,
UTF-8 BOM, UTF-16 LE/BE, unsupported-encoding rejection), parsing (valid fixtures,
malformed XML, missing envelope, unknown/known-unsupported tag warnings), mapping
(GST rate summation, `&#4;`-prefix stripping, "num/unit" and "num unit" splitting,
state-code lookup, group classification, cash-sale recognition, multi-line vouchers),
validation (every rule above, proven to collect every issue in one pass rather than
halting at the first), dependency ordering (items before sales; a synthetic cycle still
throws; a two-file master-then-voucher workflow correctly resolves cross-file item/party
references), conflict detection (all three detectors), preview (Found/New/Duplicate/
Ignored/Invalid counts), transaction/rollback (LIFO undo on a mid-run failure, verified
with injected fake writers — not a live-DB-proven test), progress (a 250-record
synthetic batch), and history (`createHistoryEntry` construction).

Regression, run the same way:
- `dataExchange.test.html` (Milestone 9A): **43/43 passed**, unchanged.
- `js/ui/forms/forms.test.html`: **80/80 passed**, unchanged.

`git diff --stat` against the pre-9B tree: only new files (the `xml/` subtree,
`xml_import_rpc.sql`, this report, the mapping doc) — zero modified files, same
discipline as every prior milestone.

## 6. One-time real-file smoke test (not committed)

The two real supplied files (`master.xml`, `voucher.xml`, both `~/Downloads`, both real
Tally exports for a real business) were run through parse -> validate -> conflict ->
preview once, from a temporary local harness that was deleted immediately after — no
live Supabase write, no company/invoice/GST/phone detail from the files reproduced here
or anywhere in version control; only aggregate counts:

**master.xml** (635,206 bytes): parsed to 85 records — `STOCKITEM` 26, `LEDGER` 30,
`GROUP` 28, `COMPANY` 1 — with **0 parse errors**. 110 warnings, all known-unsupported
tags (`CURRENCY` 1, `UNIT` 3, `COSTCATEGORY` 1, `INCOMETAXCLASSIFICATION` 93,
`INCOMETAXSLAB` 6, `TAXUNIT` 1, `VOUCHERTYPE` 4, `GODOWN` 1 = 110), matching the mapping
document's entity inventory exactly. Mapped to 26 new items, 1 new customer, 0
suppliers, 29 ignored ledgers (system accounts) — matching the mapping doc's own count
of "exactly one LEDGER resolves to Sundry Debtors, zero to Sundry Creditors." 0
validation errors, 0 validation warnings, 0 conflicts (no existing company data was
supplied to compare against in this standalone run).

**voucher.xml** (357,710 bytes): parsed to 17 records — `VOUCHER` 16 (all `VCHTYPE="Sales"`),
`COMPANY` 1 — with **0 parse errors**. Mapped to 16 sale entries. Run in isolation (this
file's items weren't pre-loaded as "existing" in this standalone smoke run), reference
validation correctly flagged all 16 vouchers' item references as unresolved and the
ledger-balance rule fired its informational warning on all 16 — both exactly the expected
behavior described in sections 3 and 4 of this report, not a defect. In a real two-step
import (master.xml first, voucher.xml second against the company that import just
populated), those reference errors do not occur — proven directly in
`xmlImport.test.html`'s "dependency ordering" section using the synthetic fixtures.

Also notable: the real `master.xml` contains Tally's `&#4;` illegal-XML-character-reference
quirk (documented in the mapping doc section 6) on enum-like fields. The synthetic fixture
reproduced this exactly and caught a real bug during development — the browser's strict
DOMParser rejects `&#4;` outright (`invalid xmlChar value 4`), so `tallyXmlParser.js`
now strips any numeric character reference that resolves to an XML-illegal code point
*before* handing text to DOMParser (a spec-driven fix, not a guess — legal references
like `&#8377;` for the Rupee symbol pass through untouched). The real file parsing
cleanly (0 errors) after that fix confirms it works against genuine Tally output, not
just the fixture.

## 7. New SQL — not yet applied

`xml_import_rpc.sql` (`record_opening_stock`) is written and unit-tested via
`xmlImport.test.html`'s fake-writer transaction tests, but **has not been run against
your live Supabase project** — this environment has no database credentials. Apply it
the same way `stock_rpc.sql`/`sale_rpc.sql`/`manufacturing_rpc.sql` were originally
applied, before the opening-stock write path works against real data. No schema
migration is needed (`schema.sql` already has `parties.opening_balance` and
`stock_ledger.txn_type = 'opening'`).

## 8. Remaining work for 9C (Export) and beyond

- **Export direction** (ApnaBill -> Tally XML or any other format) is entirely out of
  scope here — 9B is import-only, per the milestone split.
- **Settings/import screen UI**: no such screen exists in this codebase (confirmed
  during both 9A and 9B research); `xmlImporter.js` is UI-independent and ready to be
  wired into one whenever it's built, exactly as 9A's non-goals anticipated.
- **Voucher types beyond Sales** (Purchase/Manufacturing/Payment/Receipt/Journal): the
  `voucherDispatcher` registry supports adding a handler for each without touching the
  dispatcher or `xmlImporter.js` — but no handler exists yet, since the supplied sample
  data contains only `Sales` vouchers and building parsing logic for shapes not present
  in real data would mean inventing structure.
- **History persistence**: `createHistoryEntry()` is constructed and returned from every
  import run, but nothing persists it (no history table exists in `schema.sql`) — adding
  one is a schema change beyond this milestone's scope, flagged rather than silently
  built or silently skipped.
- **Real-DB verification of the opening-stock/opening-balance write path**: fully built
  and unit-tested with fake writers, but never exercised against a live Supabase project
  from this environment (see section 6).
