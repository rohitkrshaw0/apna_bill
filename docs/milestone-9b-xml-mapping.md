# Milestone 9B — XML Mapping Document (Step 1, mandatory pre-implementation gate)

**Status:** Research complete against the two supplied files (`master.xml`, 14,200 lines /
620KB; `voucher.xml`, 7,014 lines / 349KB — both found in `~/Downloads`, no BOM, ASCII/UTF-8
compatible bytes at the head). **No parser code has been written.** This document is the
mapping the spec requires before implementation may begin, plus a set of decision points
that this inspection surfaced and that only the user can resolve (marked ⚠ throughout) —
resolving them by guessing would violate the spec's own "do not guess relationships" rule.

## 0. What this XML actually is

Both files are **Tally ERP / Tally Prime's native XML data-interchange format**
(`<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA>...`).
This is a well-known, real-world schema — not something invented for this project. `master.xml`
is a Tally **"All Masters"** report export; `voucher.xml` is a Tally **"Vouchers"** report
export. Both are for one Tally company: `SVCURRENTCOMPANY = "Groomskart"`.

## 1. Root structure (identical in both files)

```
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>All Masters</REPORTNAME>          <!-- or "Vouchers" -->
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>Groomskart</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF"> ... </TALLYMESSAGE>   <!-- repeated, one per master/voucher record -->
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>
```

`REPORTNAME` tells the parser which of the two schemas below to expect. `SVCURRENTCOMPANY`
names the Tally company the data belongs to (see §7, open question).

## 2. Entity inventory actually present (exhaustive grep across both files)

Per the spec's own rule — "only implement entities that actually exist in the supplied
XML" — this is the complete list. Nothing else exists in these files.

**`master.xml`** (each is a direct child of `<TALLYMESSAGE>`):

| Tag | Count | Maps to (9A DTO) | Notes |
|---|---|---|---|
| `<COMPANY>` | 1 | `companyDTO` (partial) | Appears once, at the very end (line 14188) — see §3.1 |
| `<CURRENCY>` | 1 | *(none — informational only)* | Single currency, always ₹/INR — see §3.2 |
| `<UNIT>` | 3 | *(none — consulted, not imported)* | UNT, Mtr, Pcs — see §3.3 |
| `<STOCKITEM>` | 26 | `itemDTO` | See §3.4 |
| `<LEDGER>` | 30 | `customerDTO` / `supplierDTO` / *(unsupported)* | Classification depends on `<PARENT>` group — see §3.5 |
| `<GROUP>` | 28 | *(none — consulted, not imported)* | Tally's chart-of-accounts; used only to classify LEDGERs — see §3.5 |
| `<COSTCATEGORY>` | 1 | *(unsupported)* | No ApnaBill equivalent (cost-centre accounting) |
| `<INCOMETAXCLASSIFICATION>` | ~100 | *(unsupported)* | Indian income-tax slabs; no ApnaBill equivalent |
| `<INCOMETAXSLAB>` | 6 | *(unsupported)* | Same as above |
| `<TAXUNIT>` | 1 | *(unsupported)* | GST registration/tax-unit config; no ApnaBill equivalent |
| `<VOUCHERTYPE>` | 4 | *(unsupported)* | Tally voucher-type *configuration* (not actual transactions) — ApnaBill's sale/purchase/mfg screens aren't configurable voucher types |
| `<GODOWN>` | 1 | *(unsupported)* | Tally warehouse/location — ApnaBill's schema has no godown/location table |

**`voucher.xml`** (each `<TALLYMESSAGE>` wraps one `<VOUCHER VCHTYPE="...">`):

| `VCHTYPE` value found | Count | Maps to (9A DTO) |
|---|---|---|
| `Sales` | 16 | `saleDTO` |

**No** `Purchase`, `Manufacturing`/Stock Journal, `Payment`, `Receipt`, `Journal`, or any
other `VCHTYPE` appears anywhere in the supplied `voucher.xml` (verified: `grep -o
'VCHTYPE="[^"]*"'` returns `Sales` for all 16 matches, nothing else). **Per the spec's own
rule, this narrows 9B's actual voucher-import scope to Sales only** — building parser logic
for Purchase/Manufacturing/Payment/Receipt/Journal voucher shapes now would be inventing
structure the supplied XML doesn't contain, which the spec explicitly forbids. ⚠ **flagged
in §7.4.**

Everything in the "unsupported" rows above is a real Tally tag, not a malformed or unknown
one — the parser must still recognize these tags by name, collect them as **warnings** (per
spec: "Unknown XML tags must never crash the parser... continue whenever safely possible"),
and skip importing them. They are not literally *unknown* tags (the parser knows what they
are), so the mapping document records them as "known, out of ApnaBill's schema" rather than
"unrecognized" — an unrecognized tag would be anything not in this table at all, which would
get the same warning-and-skip treatment.

## 3. Per-entity structure, fields, and DTO mapping

### 3.1 `<COMPANY>` → `companyDTO` (partial)

```xml
<COMPANY>
  <REMOTECMPINFO.LIST MERGE="Yes">
    <NAME></NAME>
    <REMOTECMPNAME>Groomskart</REMOTECMPNAME>
    <REMOTECMPSTATE>West Bengal</REMOTECMPSTATE>
  </REMOTECMPINFO.LIST>
</COMPANY>
```

Only two usable fields exist: company name and state *name* (not a GST state code — Tally
gives "West Bengal", ApnaBill's `firms.state_code`/`parties.state_code` columns want the
2-digit GST code, e.g. `"19"`). A name→code lookup table (the 37 published GST state codes)
is needed; this is static reference data, not a business-logic change.

- `name` → `companyDTO.name`
- `stateCode` → `companyDTO.stateCode`, via the state-name lookup
- No GSTIN, address, or phone exists anywhere for the company itself in this file.

⚠ **See §7.1 — whether this creates a new ApnaBill company/firm, or is only a confirmation
check against the currently active one.**

### 3.2 `<CURRENCY>` → not imported

Single record, `NAME="₹"`, `EXPANDEDSYMBOL=INR`, 2 decimal places. ApnaBill is INR-only
everywhere already (every `fmt()` in the codebase hardcodes `₹`). This entity carries no
actionable data — read for `getMetadata()`/informational purposes only, never becomes a DTO.

### 3.3 `<UNIT>` → not imported, consulted as a lookup

Three records: `UNT` (generic "units"), `Mtr` (meters), `Pcs` (pieces) — each just a
`NAME`/`GSTREPUOM` pair. ApnaBill has no units master table; `items.unit` is a free-text
column (see `schema.sql:132`, `not null default 'PCS'`). The parser reads these to build a
**known-units set** used by Reference Validation (does a `STOCKITEM`'s `BASEUNITS` reference
an actual defined `UNIT`?) — it does not create any DTO from a `<UNIT>` element itself.

### 3.4 `<STOCKITEM>` → `itemDTO`

Representative record (`Pant pyjama`), fields that matter (of ~60 total fields per record,
most are Tally-internal booleans like `ISBATCHWISEON`/`ISCOSTCENTRESON` with no ApnaBill
equivalent — recorded as known-and-ignored, not warnings, since they're expected Tally
noise on every record, not anomalies):

```xml
<STOCKITEM NAME="Pant pyjama" RESERVEDNAME="">
  <PARENT/>                          <!-- item-group; ALWAYS empty across all 26 records -->
  <GSTAPPLICABLE>&#4; Applicable</GSTAPPLICABLE>   <!-- see §4.3 parsing quirk -->
  <BASEUNITS>Pcs</BASEUNITS>
  <ISBATCHWISEON>No</ISBATCHWISEON>  <!-- always No in this file -->
  <OPENINGBALANCE> 0 Pcs</OPENINGBALANCE>   <!-- always "0 <unit>" in this file, see §7.3 -->
  <OPENINGVALUE>0</OPENINGVALUE>
  <GSTDETAILS.LIST>
    <HSNCODE>540752</HSNCODE>
    <TAXABILITY>Taxable</TAXABILITY>
    <STATEWISEDETAILS.LIST>
      <RATEDETAILS.LIST><GSTRATEDUTYHEAD>Central Tax</GSTRATEDUTYHEAD><GSTRATE>2.5</GSTRATE></RATEDETAILS.LIST>
      <RATEDETAILS.LIST><GSTRATEDUTYHEAD>State Tax</GSTRATEDUTYHEAD><GSTRATE>2.5</GSTRATE></RATEDETAILS.LIST>
      <RATEDETAILS.LIST><GSTRATEDUTYHEAD>Integrated Tax</GSTRATEDUTYHEAD><GSTRATE>5</GSTRATE></RATEDETAILS.LIST>
      <RATEDETAILS.LIST><GSTRATEDUTYHEAD>Cess</GSTRATEDUTYHEAD></RATEDETAILS.LIST>  <!-- GSTRATE absent = 0 -->
    </STATEWISEDETAILS.LIST>
  </GSTDETAILS.LIST>
  <BATCHALLOCATIONS.LIST>            <!-- opening-stock batch, see §7.3 -->
    <GODOWNNAME>Main Location</GODOWNNAME>
    <BATCHNAME>Primary Batch</BATCHNAME>
    <OPENINGBALANCE> 0 Pcs</OPENINGBALANCE>
    <OPENINGVALUE>0</OPENINGVALUE>
  </BATCHALLOCATIONS.LIST>
</STOCKITEM>
```

Mapping:

| XML field | Required? | itemDTO field | Notes |
|---|---|---|---|
| `NAME` attr | required | `name` | |
| `BASEUNITS` | required | `unit` | validated against the `<UNIT>` lookup (§3.3) |
| `GSTAPPLICABLE` | optional | *(validation input)* | "Applicable"/"Not Applicable" (after stripping `&#4;`, §4.3); if not applicable, `gstRate`/`cessRate` should both resolve to 0 regardless of `GSTDETAILS.LIST` content |
| `GSTDETAILS.LIST > STATEWISEDETAILS.LIST > RATEDETAILS.LIST[GSTRATEDUTYHEAD="Central Tax"].GSTRATE` + the matching `"State Tax"` entry | optional | `gstRate` | **sum** of Central Tax + State Tax (2.5+2.5=5, matching the "Integrated Tax" entry's 5 — Tally always keeps CGST+SGST == IGST for the same item, a useful cross-check) |
| `GSTDETAILS.LIST > ... [GSTRATEDUTYHEAD="Cess"].GSTRATE` | optional | `cessRate` | absent tag = 0, not an error |
| `GSTDETAILS.LIST.HSNCODE` | optional | `hsnSac` | |
| `PARENT` | — | *(unused)* | always empty in this file; item-group hierarchy isn't populated, so no mapping target exists to exercise |
| `OPENINGBALANCE` (item-level and batch-level) | optional | *(opening stock, see §7.3)* | format is `"<number> <unit>"` as one text node — needs splitting, not a plain number |
| — | — | `code` | **no field exists for this anywhere in `STOCKITEM`** — ApnaBill's `items.code` (barcode/SKU) has no Tally equivalent in this data; will be `null` on import, which `itemDTO`/`createItem` already treat as optional |
| — | — | `kind` | Tally has no goods-vs-service marker on `STOCKITEM` itself (all 26 are physical goods here) — defaults to `'goods'`, matching `itemDTO`'s existing default |
| — | — | `trackBatches` | Tally's `ISBATCHWISEON` is `No` on every record in this file, but ApnaBill's own default is `trackBatches: true` (per `itemDTO`) — **direct conflict**, resolved by trusting the XML (per the spec's precedence rule) and setting `false` when `ISBATCHWISEON` is `No` |

### 3.5 `<GROUP>` (consulted only) and `<LEDGER>` → `customerDTO` / `supplierDTO` / unsupported

`<GROUP>` defines Tally's 2-level chart-of-accounts (28 records: ~17 top-level groups with
`<PARENT/>` empty, ~11 sub-groups pointing to a parent group by name). The two groups that
matter for classification:

```xml
<GROUP NAME="Sundry Debtors" RESERVEDNAME="Sundry Debtors"><PARENT>Current Assets</PARENT></GROUP>
<GROUP NAME="Sundry Creditors" RESERVEDNAME="Sundry Creditors"><PARENT>Current Liabilities</PARENT></GROUP>
```

Every `<LEDGER>` names its group via `<PARENT>` (e.g. `<PARENT>Sundry Debtors</PARENT>`).
Classification rule: a `LEDGER` whose `PARENT` is (or resolves, via the group hierarchy, to)
`"Sundry Debtors"` → `customerDTO`; `"Sundry Creditors"` → `supplierDTO`. Everything else
(`Purchase Accounts`, `Sales Accounts`, `Indirect Incomes`, `Indirect Expenses`, `Duties &
Taxes`, `Cash-in-Hand`, `Current Assets`/`Current Liabilities` directly, etc.) is a Tally
system/accounting ledger with **no ApnaBill equivalent** — collected as a warning, not
imported. `GROUP` itself never becomes a DTO (ApnaBill has no chart-of-accounts concept) —
it exists purely so the parser can resolve a `LEDGER`'s classification.

**Actual data in this file:** of 30 `LEDGER` records, exactly **one** resolves to
`Sundry Debtors` — `"Cash Sale"` — and **zero** resolve to `Sundry Creditors`. Every other
ledger is a system account (`Cash`, `Sales`, `Purchase`, `CGST`/`SGST`/`IGST`, `Discount
(Sales/Purchase/Credit Note/Debit Note)`, `Round Off (...)`, `Shipping & Packing (...)`,
`Packaging (...)`, `Adjustment (...)`, `Profit & Loss A/c`). **This file contains no real
named customers or suppliers** — see ⚠ §7.2, which is exactly about how to treat `"Cash
Sale"`.

`customerDTO`/`supplierDTO` field mapping (from the one classifiable record):

| XML field | customerDTO/supplierDTO field |
|---|---|
| `NAME` attr | `name` |
| `MAILINGNAME.LIST.MAILINGNAME` | *(not separately used — same as NAME in this data)* |
| `LEDSTATENAME` | `stateCode` (needs the same name→code lookup as §3.1) |
| `PARTYGSTIN` | `gstin` (empty in this file's one record) |
| `PINCODE`, address-list fields | `address` (empty in this file — confirmed zero non-empty `<ADDRESS.LIST>` blocks across all 30 ledgers) |
| — | `phone` | **no field exists anywhere in `LEDGER`** for a phone number in this Tally export; will be `null` |
| `OPENINGBALANCE` | *(opening balance, see §7.3)* — `0` in this file's one record |

### 3.6 Voucher (`Sales`) → `saleDTO`

Structure of one `<VOUCHER VCHTYPE="Sales">` (fields that matter; ~50 boolean
`ISxxx`/`USExxx` fields per voucher are Tally invoice-mode configuration with no ApnaBill
equivalent, recorded as known-and-ignored):

```xml
<VOUCHER VCHTYPE="Sales" ACTION="Create">
  <DATE>20260701</DATE>                          <!-- YYYYMMDD -->
  <PARTYNAME>Cash Sale</PARTYNAME>
  <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
  <REFERENCE>KI/2026-27/96</REFERENCE>
  <VOUCHERNUMBER>96</VOUCHERNUMBER>
  <PARTYLEDGERNAME>Cash Sale</PARTYLEDGERNAME>
  <LEDGERENTRIES.LIST>                           <!-- the PARTY's ledger posting -->
    <LEDGERNAME>Cash Sale</LEDGERNAME>
    <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
    <AMOUNT>-2050</AMOUNT>                       <!-- negative = total invoice amount owed -->
    <BILLALLOCATIONS.LIST><NAME>7</NAME><AMOUNT>-2050</AMOUNT></BILLALLOCATIONS.LIST>
  </LEDGERENTRIES.LIST>
  <ALLINVENTORYENTRIES.LIST>                     <!-- repeated, one per line item -->
    <STOCKITEMNAME>Shaded Kurta 96997</STOCKITEMNAME>
    <RATE>1500/Pcs</RATE>                        <!-- "<rate>/<unit>" combined in one text node -->
    <DISCOUNT>0</DISCOUNT>
    <AMOUNT>1500</AMOUNT>                        <!-- line total -->
    <ACTUALQTY> 1 Pcs</ACTUALQTY>                <!-- "<qty> <unit>" combined -->
    <BILLEDQTY> 1 Pcs</BILLEDQTY>
    <BATCHALLOCATIONS.LIST>
      <GODOWNNAME>Main Location</GODOWNNAME>
      <BATCHNAME>Primary Batch</BATCHNAME>        <!-- generic default, not a real shade/size -->
    </BATCHALLOCATIONS.LIST>
    <ACCOUNTINGALLOCATIONS.LIST>
      <LEDGERNAME>Sales</LEDGERNAME>
      <AMOUNT>1500</AMOUNT>                       <!-- revenue posting for this line -->
    </ACCOUNTINGALLOCATIONS.LIST>
  </ALLINVENTORYENTRIES.LIST>
  <LEDGERENTRIES.LIST>                            <!-- tax/adjustment postings, NOT per-item -->
    <LEDGERNAME>IGST</LEDGERNAME><AMOUNT>0</AMOUNT>
  </LEDGERENTRIES.LIST>
  <LEDGERENTRIES.LIST><LEDGERNAME>Discount (Sales)</LEDGERNAME><AMOUNT>-149.75</AMOUNT></LEDGERENTRIES.LIST>
  <LEDGERENTRIES.LIST><LEDGERNAME>Round Off (Sales)</LEDGERNAME><AMOUNT>2.24</AMOUNT></LEDGERENTRIES.LIST>
</VOUCHER>
```

Mapping to `saleDTO`:

| XML field | Required? | saleDTO field | Notes |
|---|---|---|---|
| `VOUCHERNUMBER` | required | `invoiceNo` | `REFERENCE` (`"KI/2026-27/96"`) is a separate, richer reference string — carried in `meta`, not `invoiceNo` |
| `DATE` | required | `invoiceDate` | `YYYYMMDD` text → needs parsing to `YYYY-MM-DD` |
| `PARTYLEDGERNAME` | required | `customerId` | resolves to a `customerDTO` by name (or `null` — ⚠ §7.2) |
| `ALLINVENTORYENTRIES.LIST` (repeated) | required (≥1) | `lines[]` | each: `STOCKITEMNAME`→item lookup, `RATE` split on `/`→rate+unit (unit cross-checked against item's own unit), `AMOUNT`→line total, `ACTUALQTY`/`BILLEDQTY` split on leading space →qty (usually equal; a mismatch is a **quantity validation** case per spec's "Invalid quantities") |
| Sum of non-party `LEDGERENTRIES.LIST` (`CGST`/`SGST`/`IGST`/`Discount (Sales)`/`Round Off (Sales)`/etc.) | required | `totals` | GST split (CGST+SGST vs IGST) determines `is_interstate`, matching `buildSale()`'s existing logic in `js/sales.js` exactly — this importer must **reuse that function**, not reimplement GST math |
| `payment` | n/a | `payment` | **no payment/receipt data exists inside a Sales voucher in this file** — every voucher here is credit-only (no separate Payment/Receipt voucher was supplied either, §2). `payment: null` for all 16. |

### 3.7 Fields with no ApnaBill target at all (recorded, never warned about — expected Tally noise)

Every `IS*`/`USE*`/`HAS*` boolean administrative flag (there are dozens per record — TDS/TCS/
FBT/excise/VAT/service-tax applicability, cheque-printing flags, e-banking flags, etc.), every
`*.LIST` that is empty (`<XDETAILS.LIST>      </XDETAILS.LIST>`), `GUID`, `ALTERID`,
`MASTERID`, `OLDAUDITENTRYIDS.LIST`, `SORTPOSITION`, `LANGUAGENAME.LIST`. These belong to
Tally's own internal bookkeeping and Indian-tax-regime features (excise, VAT, service tax,
TDS/TCS) that predate GST and have no ApnaBill equivalent whatsoever — parsed only far enough
to skip past them, never surfaced as warnings (a warning implies "this might matter and got
dropped"; these categorically never matter to ApnaBill's schema).

## 4. Validation rules this data requires

1. **Required fields**: `STOCKITEM.NAME`/`BASEUNITS`; `LEDGER.NAME`; voucher
   `VOUCHERNUMBER`/`DATE`/at least one `ALLINVENTORYENTRIES.LIST`.
2. **Data types**: `DATE` must be 8 digits (`YYYYMMDD`); `AMOUNT`/`GSTRATE`/`ACTUALQTY`
   numeric (note: several numeric fields have a **leading space** as a formatting artifact,
   e.g. `<ALTERID> 250</ALTERID>`, `<DECIMALPLACES> 2</DECIMALPLACES>` — trim before parsing,
   don't reject on whitespace).
3. **Combined-value fields need splitting, not just parsing**: `RATE` (`"1500/Pcs"` →
   number + unit), `ACTUALQTY`/`BILLEDQTY`/item-level `OPENINGBALANCE` (`" 1 Pcs"` → number +
   unit) — splitting on the delimiter (`/` or first space) is itself a validation step: reject
   if the split doesn't yield a parseable number.
4. **References**: every `ALLINVENTORYENTRIES.STOCKITEMNAME` must resolve to an imported (or
   already-existing) item; every `PARTYLEDGERNAME` must resolve to a customer or the walk-in
   case (§7.2); every `LEDGER.PARENT` must resolve to a known `GROUP` name.
5. **Missing dependencies**: a voucher referencing a `STOCKITEMNAME` not present in `master.xml`
   (and not already in the target company) is a **Reference Validation** error, not a crash.
6. **Duplicates**: `STOCKITEM.NAME` (unique per company, per `schema.sql`'s
   `idx_items_code`/name lookup), `VOUCHERNUMBER` (should be unique per company, cross-checked
   against ApnaBill's own invoice numbering — this is where the Conflict Engine's duplicate
   detection applies, not a hard reject).
7. **Business validation**: `GSTAPPLICABLE = "Not Applicable"` but a non-zero `GSTRATE` present
   is an inconsistency worth a warning (didn't occur in this file, but the field independence
   means it's structurally possible); a voucher's ledger entries not summing to zero (basic
   double-entry check) is a warning, not a hard reject, since Tally data is generally
   already-posted and trustworthy.
8. **Unknown tags**: any tag not in §2/§3's inventory → collect as a warning, continue parsing
   its parent. Only reject the whole document if the **required envelope structure** itself
   (`ENVELOPE > BODY > IMPORTDATA > REQUESTDATA > TALLYMESSAGE`) is broken.

## 5. Dependency order (derived from what's actually in this data, not invented)

```
Company (confirm/context only, §7.1)
  ↓
Units (consulted, not imported)
  ↓
Groups (consulted, not imported — classifies Ledgers)
  ↓
Items (STOCKITEM → itemDTO)
  ↓
Customers (LEDGER under Sundry Debtors → customerDTO)     [Suppliers: none present in this file]
  ↓
Opening Stock / Opening Balances (all-zero in this file, §7.3)
  ↓
Sales vouchers (→ saleDTO, depends on Items + Customers existing first)
```

This is registered into 9A's generic `createDependencyGraph()` at implementation time — the
graph engine itself stays entity-agnostic; only the edges above get added.

## 6. Parsing quirks specific to this data (not generic XML concerns)

- `&#4;` prefix on several enum-like text values (`GSTAPPLICABLE`, `EXCISEAPPLICABILITY`,
  `VATAPPLICABLE`, `SERVICECATEGORY`) — a literal control character Tally's exporter uses as a
  bullet marker. Must be stripped before comparing against expected values
  (`"Applicable"`/`"Not Applicable"`), not treated as a malformed-entity error.
- Self-closing empty tags are common and valid (`<PARENT/>`, `<CATEGORY/>`,
  `<TAXCLASSIFICATIONNAME/>`) — equivalent to an empty text node, not absent.
- Many `X.LIST` tags contain only whitespace (`<FOO.LIST>      </FOO.LIST>`) — an empty list,
  not an error.
- HTML-escaped ampersands are used correctly throughout (`&amp;` in group/ledger names like
  `"Duties &amp; Taxes"`) — standard XML escaping, no special handling needed beyond a
  compliant XML parser.

## 7. Open decisions — flagged, not resolved (need your input before implementation)

### 7.1 Does importing `<COMPANY>` create a new ApnaBill company, or confirm the active one?

The XML's `<COMPANY>` block has just a name and state — far thinner than ApnaBill's actual
company/firm model (`companies` → `firms`, with GSTIN, address, invoice prefixes, etc., none
of which exist in this XML). ApnaBill has no existing "create company from import" workflow,
and every service function scopes by `getActiveCompanyId()`. The two options:

- **(a)** XML import always operates within whichever company/firm the user currently has
  active (via `index.html`'s existing company picker) — the XML's `<COMPANY>` name/state is
  used only to show a confirmation ("This file is for 'Groomskart' — you're currently in
  '{active company}'. Continue?"), never to create anything.
- **(b)** XML import can create a brand-new company from `<COMPANY>` — this would need new
  UI/logic beyond "connect the XML import workflow," which 9B's own spec says not to build.

**(a) is the only option that doesn't require new business logic or a new workflow** — flagging
for your confirmation rather than assuming.

### 7.2 Does `LEDGER NAME="Cash Sale"` map to ApnaBill's walk-in/no-party sale, or a literal named customer?

All 16 sales in `voucher.xml` use `PARTYLEDGERNAME = "Cash Sale"` — Tally's convention for
retail/walk-in sales with no real customer captured. ApnaBill already has a first-class
equivalent: `sale.html`'s `party: null` state, rendered literally as **"Cash sale"** in the UI
(`js/sales.js`/`sale.html:50`). Two readings:

- **(a)** Recognize `"Cash Sale"` as Tally's walk-in marker → import all 16 vouchers with
  `customerId: null` (ApnaBill's native "Cash sale"), and **don't** create a spurious customer
  record for it.
- **(b)** Import it literally as a named customer (`customerDTO.name = "Cash Sale"`), exactly
  as the XML states — the conservative "don't guess relationships" reading.

I lean toward (a) given how precisely it matches an existing, named ApnaBill concept — but
this is an inference about intent, not something the XML states directly (the ledger is
structurally identical to a real named customer), so I'm flagging rather than deciding.

### 7.3 Opening Balance / Opening Stock: real column exists, but no write path exists yet

Good news: `schema.sql` already has `parties.opening_balance` (real, dedicated column) and
`stock_ledger.txn_type` already includes `'opening'` as a valid enum value (`schema.sql:207`)
— so the **schema** already anticipates this, no schema change needed. However, **no existing
JS function writes either of these** — `createItem()`/`createSupplier()` don't accept an
opening-balance parameter, and nothing calls `stock_ledger` with `txn_type='opening'`
(`recordStockAdjustment()` only writes `'adjustment'`). Since every opening-balance/opening-
stock value in this supplied file is `0`, this gap is **dormant for this specific data** — the
parser can read and validate these fields (reject if non-numeric, warn if non-zero-but-
unhandled) without needing new plumbing right now. But if a future file has real non-zero
opening data, someone will need to add a small new function (e.g. `createOpeningStock`) to the
existing service layer — that's a new capability, not a modification of existing business
logic, but it's still new code I shouldn't add speculatively for data that doesn't exist in
what you gave me. Flagging so the decision to build it now vs. defer it is explicit rather
than silently skipped or silently built.

### 7.4 Voucher scope narrows to Sales only, because that's all that's supplied

`voucher.xml` contains exclusively `VCHTYPE="Sales"` (16 of them). Per the spec's own
"only implement entities that actually exist in the supplied XML" rule, 9B's voucher-side
implementation should cover **Sales import only** — not Purchase/Manufacturing/Payment/
Receipt/Journal, since building parsing logic for shapes that aren't in the supplied file
would mean inventing structure, which the spec forbids. Confirming this narrowed scope
explicitly before I start, since the spec's own bulleted list of "supported" voucher types
names all of them as *possibilities*, not as things guaranteed to be in *this* file.

## 8. What's ready to implement once the above is confirmed

Sections 2–6 above are the actual mapping — internally consistent, cross-checked against
`schema.sql` and the existing service layer (`js/items.js`, `js/suppliers.js`, `js/sales.js`).
Nothing in the parser/DTO-mapping design depends on how §7's four questions are answered
except the exact handling of the Company step, the "Cash Sale" customer, and whether opening-
balance writes are built now — everything else (Items, the Sales-voucher pipeline, GST-rate
extraction, dependency ordering, validation rules) is unambiguous and ready to build.
