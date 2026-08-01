# Reporting Platform — Report Catalog

**As of:** Milestone 14B (`reporting-operational-reports-v1.0`, commit `0095840`)

This is the canonical, current-state inventory of every report registered against the
Reporting Platform's shared `reportRegistry` — **12 registrations across 8 screens**. It
is a catalog, not a design document: for *why* each decision was made, see the ADRs
(0003–0005) and the individual sub-milestone completion reports it links to. Future
reporting work (14C and beyond) should update this file when a report is added, renamed,
retired, or re-sourced — the same way `docs/architecture/ADR/README.md`'s own index is
kept current.

Two report groups need special handling because their screen and data provider are
**shared with another report** rather than unique to themselves:

- **Registry Aliases** — a second `ReportDefinition`, discoverable under a different
  report `category` in the Reports hub, whose `href` points at another report's own
  screen unmodified. No query parameter differs; the underlying report is identical.
- **Registry Presets** — a second (or third) `ReportDefinition` whose `href` points at
  another report's screen *with* a query parameter that pre-selects a starting filter
  value on load (still user-changeable afterward).

Every report in this catalog supports **Print** (`triggerPrint()`, the shared
`css/report-print.css` framework) and **CSV export** (`downloadCsv()`, the shared Export
Framework) — neither is repeated per-row below except to note the export filename stem
and whether export covers the loaded page or the full filtered result.

## Operational Reports — ERP-Sourced

| | Sales Register | Purchase Register | Stock Register | Outstanding Summary | Supplier Outstanding |
|---|---|---|---|---|---|
| **Report ID** | `sales-register` | `purchase-register` | `stock-register` | `outstanding-summary` | `supplier-outstanding` |
| **Category** | `sales` | `purchase` | `inventory` | `customer` | `supplier` |
| **Data Source** | ERP | ERP | ERP | ERP | ERP |
| **Screen** | `sales-register.html` | `purchase-register.html` | `stock-register.html` | `outstanding-summary.html` | `supplier-outstanding.html` |
| **Provider** | `js/salesRegisterData.js` (`listSalesRegisterRows`/`listAllSalesRegisterRows`) | `js/purchaseRegisterData.js` (`listPurchaseRegisterRows`/`listAllPurchaseRegisterRows`) | `js/stockRegisterData.js` (`listStockRegisterRows`/`listAllStockRegisterRows`) | `js/customerOutstandingData.js` (`listCustomerOutstandingBalances`/`listAllCustomerOutstandingBalances`) | `js/suppliers.js`'s existing `listSuppliers()` (reused, no new provider file) |
| **Registry entry** | `js/operationalReports/salesRegister.js` → `registerSalesRegisterReport()` | `js/operationalReports/purchaseRegister.js` → `registerPurchaseRegisterReport()` | `js/operationalReports/stockRegister.js` → `registerStockRegisterReport()` | `js/operationalReports/customerOutstanding.js` → `registerCustomerOutstandingReport()` | `js/operationalReports/supplierOutstanding.js` → `registerSupplierOutstandingReport()` |
| **Filters** | Date Range, Customer, Status (doc_type), Payment Status, Search (invoice no/name/phone) | Date Range, Supplier, Payment Status, Search (bill no) | Date Range, Item, Status (txn_type), Search (notes) | Status (Outstanding/Credit/Settled — presentation bucket), Search (name/phone) | Search (name/phone/GSTIN — no Balance Status filter, see Known Limitations) |
| **Sort** | Date, Invoice No, Customer, Amount, Amount Due | Date, Bill No, Amount, Amount Due | Date, Qty In, Qty Out | Balance (highest first, default), Name | Balance (payable first, default), Name |
| **Pagination** | Server `.range()` + Load more | Server `.range()` + Load more | Server `.range()` + Load more | Server `.range()` + Load more | Server `.range()` + Load more (via `listSuppliers()`) |
| **CSV export scope** | Full filtered result (`listAllSalesRegisterRows`) | Full filtered result | Full filtered result | Full filtered result | Full filtered result (inline loop over `listSuppliers()`, no new function) |
| **CSV filename** | `sales-register-YYYY-MM-DD.csv` | `purchase-register-YYYY-MM-DD.csv` | `stock-register-YYYY-MM-DD.csv` | `outstanding-summary-YYYY-MM-DD.csv` | `supplier-outstanding-YYYY-MM-DD.csv` |
| **Sub-milestone** | 14B.2 | 14B.3 | 14B.4A | 14B.5B | 14B.6 |

## Operational Reports — Business Intelligence-Sourced

| | Current Stock | Low Stock | Negative Stock | Customer Purchase Profile | Supplier Purchase Profile |
|---|---|---|---|---|---|
| **Report ID** | `current-stock` | `low-stock` | `negative-stock` | `customer-purchase-profile` | `supplier-purchase-profile` |
| **Category** | `inventory` | `inventory` | `inventory` | `customer` | `supplier` |
| **Data Source** | Business Intelligence | Business Intelligence | Business Intelligence | Business Intelligence | Business Intelligence |
| **Screen** | `current-stock.html` | `current-stock.html` (preset) | `current-stock.html` (preset) | `customer-purchase-profile.html` | `supplier-purchase-profile.html` |
| **Provider / API** | `inventoryIntelligence.getItemMetricsSnapshot()` | same call, shared | same call, shared | `salesIntelligence.getSalesMetricsSnapshot()` (`.customerMetrics`) | `supplierIntelligence.getSupplierMetricsSnapshot()` (`.supplierMetrics`) — the richer, composed domain, not `purchaseIntelligence`'s own narrower `supplierMetrics` |
| **Registry entry** | `js/operationalReports/currentStock.js` → `registerCurrentStockReport()` | same file → `registerLowStockReport()` | same file → `registerNegativeStockReport()` | `js/operationalReports/customerPurchaseProfile.js` → `registerCustomerPurchaseProfileReport()` | `js/operationalReports/supplierPurchaseProfile.js` → `registerSupplierPurchaseProfileReport()` |
| **Filters** | Category, Stock Status (5-way: Negative/Out of Stock/Low Stock/In Stock/Not Tracked), Search | same, `status` pre-seeded to `lowStock` | same, pre-seeded to `negativeStock` | Search (name) | Search (name) |
| **Sort** | Name, Current Stock (high/low), Inventory Value | same | same | Name, Total Sales Value, Order Count, Last Sale, Days Since Last Sale | Name, Purchase Value, Order Count, Last Purchase, Days Since Last Purchase |
| **Pagination** | Client-side slice over one in-memory array + Load more | same array, same mechanism | same | Client-side slice + Load more | Client-side slice + Load more |
| **CSV export scope** | Full filtered array (already fully in memory — no extra round trip) | same | same | same | same |
| **CSV filename** | `current-stock-YYYY-MM-DD.csv` | `low-stock-YYYY-MM-DD.csv` | `negative-stock-YYYY-MM-DD.csv` | `customer-purchase-profile-YYYY-MM-DD.csv` | `supplier-purchase-profile-YYYY-MM-DD.csv` |
| **Scope limitation** | None (covers every item) | None | None | Only customers with a sale in the last 365 days — not a full directory | Only suppliers with a purchase in the last 365 days — not a full directory |
| **Sub-milestone** | 14B.4B | 14B.4C | 14B.4C | 14B.5 | 14B.6 |

## Registry Aliases

Same screen, same provider, same filters as the report they alias — registered
separately purely so they are discoverable under a different `category` in the Reports
hub. No query parameter, no behavioral difference of any kind.

| | Customer Ledger | Supplier Ledger |
|---|---|---|
| **Report ID** | `customer-ledger` | `supplier-ledger` |
| **Category** | `customer` | `supplier` |
| **Aliases** | Sales Register (`sales-register`) | Purchase Register (`purchase-register`) |
| **Data Source** | ERP | ERP |
| **Screen** | `sales-register.html` (unmodified) | `purchase-register.html` (unmodified) |
| **Provider** | `js/salesRegisterData.js` (reused) | `js/purchaseRegisterData.js` (reused) |
| **Registry entry** | `js/operationalReports/salesRegister.js` → `registerCustomerLedgerReport()` | `js/operationalReports/purchaseRegister.js` → `registerSupplierLedgerReport()` |
| **Filters** | Identical to Sales Register (Date Range, Customer, Status, Payment Status, Search) | Identical to Purchase Register (Date Range, Supplier, Payment Status, Search) |
| **Print / CSV** | Identical to Sales Register | Identical to Purchase Register |
| **Sub-milestone** | 14B.5 | 14B.6 |

## Registry Presets

Same screen, same provider/API as the report they preset — registered separately with an
`href` query parameter that pre-selects a starting filter value. Unlike an Alias, the
preset changes the *initial* state (filter selection, page title/crumb, log messages,
CSV filename); the underlying data source and shell are identical.

| | Low Stock | Negative Stock |
|---|---|---|
| **Report ID** | `low-stock` | `negative-stock` |
| **Presets** | Current Stock (`current-stock`) | Current Stock (`current-stock`) |
| **Data Source** | Business Intelligence | Business Intelligence |
| **Screen** | `current-stock.html?status=lowStock` | `current-stock.html?status=negativeStock` |
| **Provider / API** | `inventoryIntelligence.getItemMetricsSnapshot()` (reused) | same |
| **Registry entry** | `js/operationalReports/currentStock.js` → `registerLowStockReport()` | same file → `registerNegativeStockReport()` |
| **Preset mechanism** | `current-stock.html` reads `?status=` once on load, sets `state.status` + the Stock Status `<select>`'s DOM value to `lowStock` — still user-changeable afterward | same, `negativeStock` |
| **Filters** | Identical to Current Stock | Identical to Current Stock |
| **Print / CSV** | Identical to Current Stock (filename stem changes to `low-stock-`) | Identical to Current Stock (filename stem changes to `negative-stock-`) |
| **Sub-milestone** | 14B.4C | 14B.4C |

*(Low Stock and Negative Stock are listed under both "Business Intelligence" above and
here — they are genuinely both: a `BUSINESS_INTELLIGENCE`-sourced report by data source,
and a Registry Preset by registration mechanism. These are two different, non-exclusive
classification axes, not a contradiction.)*

## Not a Registry Preset (a validated non-report)

**Stock Movement Register** — listed in the original 14B roadmap brief, not present
anywhere in this catalog. A repository architecture audit (14B.4D) found it identical in
every respect to Stock Register (`stock_ledger`'s own schema comment already reads
"every stock movement") — no distinguishing default existed to justify even a Registry
Alias entry. Zero code, zero registration. See
`docs/reports/milestone-14B4D-completion.md`.

## Platform Extension Points Consumed

Two additive `REPORT_FILTER_KEYS` values, both added the sanctioned way
(`reporting-platform-architecture.md` §13), are the only changes to
`js/services/reporting/` anywhere in this catalog's history:

| Key | Added by | Reused by |
|---|---|---|
| `PAYMENT_STATUS` | Sales Register (14B.2) | Purchase Register, Customer Ledger, Supplier Ledger |
| `ITEM` | Stock Register (14B.4A) | (no other report yet) |

`STATUS` (a pre-existing 14A key) is reused across five reports for five different
underlying schema/presentation concepts — `invoices.doc_type` (Sales Register), no
equivalent declared (Purchase Register omits it — no doc_type analog exists), `stock_
ledger.txn_type` (Stock Register), a computed Stock Status bucket (Current Stock/Low
Stock/Negative Stock), and a computed Balance Status bucket (Outstanding Summary). Each
reuse is presentation-level bucketing of an already-computed value — no report recomputes
a figure another report or Business Intelligence already produced.

## Quick Reference — All 12 Registry IDs

```
current-stock              inventory  BI   current-stock.html
customer-ledger             customer   ERP  sales-register.html          (alias)
customer-purchase-profile   customer   BI   customer-purchase-profile.html
low-stock                   inventory  BI   current-stock.html?status=lowStock       (preset)
negative-stock               inventory  BI   current-stock.html?status=negativeStock  (preset)
outstanding-summary          customer   ERP  outstanding-summary.html
purchase-register             purchase   ERP  purchase-register.html
sales-register                sales      ERP  sales-register.html
stock-register                 inventory  ERP  stock-register.html
supplier-ledger                supplier   ERP  purchase-register.html       (alias)
supplier-outstanding            supplier   ERP  supplier-outstanding.html
supplier-purchase-profile       supplier   BI   supplier-purchase-profile.html
```

Verified: all 12 register with zero duplicate-id errors; idempotent re-registration is a
no-op (see `docs/reports/milestone-14B-completion.md` §"Regression Summary").

## References

- `docs/reports/milestone-14B-completion.md` — the milestone completion document this
  catalog summarizes
- `docs/releases/reporting-platform-operational-reports-v1.0.md` — the release checkpoint
- `docs/architecture/reporting-platform-architecture.md` — the platform's own living
  architecture reference (§12 lists these same 12 reports at a narrative level)
- `docs/architecture/ADR/0004-reporting-data-access-strategy.md` — the two data-source
  paths every report in this catalog follows
- `docs/architecture/ADR/0005-operational-report-data-provider-pattern.md` — the
  provider-per-domain rule governing every ERP provider above
