# Milestone 14B.6 Completion Report — Supplier Reports

**Status:** All three Supplier Reports complete. This closes out Milestone 14B.6 and,
with it, all six 14B sub-milestones originally scoped. No commit, merge, tag, or push has
been made.

## 0. Repository Architecture Audit (performed before writing any code, as instructed)

Each of the three originally-listed reports was validated individually against the six
questions asked, **without assuming symmetry with Customer Reports**.

| | Supplier Ledger | Purchase History → **Supplier Purchase Profile** (kept separate, per direction) | Outstanding → **Supplier Outstanding** |
|---|---|---|---|
| **1. Operational or BI?** | Operational | BUSINESS_INTELLIGENCE | Operational |
| **2. Equivalent Customer Report?** | Yes — Customer Ledger | Yes — Customer Purchase Profile | Yes — Outstanding Summary |
| **3. Customer implementation reusable?** | Pattern only (different table) | Pattern only (different BI domain — see below) | Pattern only (different reuse target — see below) |
| **4. Existing ERP provider satisfies it?** | **Yes** — `js/purchaseRegisterData.js`'s `listPurchaseRegisterRows({ supplierId })`; Purchase Register already declares a `SUPPLIER` filter | N/A (BI-sourced) | **Yes** — `suppliers.js`'s `listSuppliers()` already returns `current_balance` and already supports `sort:'balance'` |
| **5. Existing BI API satisfies it?** | N/A | **Yes — `supplierIntelligence.getSupplierMetricsSnapshot()`**, not the narrower `purchaseIntelligence.getPurchaseMetricsSnapshot()`'s own `supplierMetrics` (see §2) | No — no balance field anywhere in Supplier Intelligence's own output |
| **6. New provider genuinely required?** | No | No | **No — unlike the customer-side case** |
| **Verdict** | Reuse of Purchase Register | New report, no new provider | New report, no new provider |

**Two genuine asymmetries with Customer Reports surfaced, exactly why "do not assume
symmetry" mattered:**

1. **A richer BI domain exists for suppliers than for customers.** There is no
   `customerIntelligence` domain, so Customer Purchase Profile had to use
   `salesIntelligence`'s own `customerMetrics` (the only available source). Suppliers
   *do* have a dedicated domain — Supplier Intelligence (12E) — whose own
   `getSupplierMetricsSnapshot()` composes across four sibling domains (Purchase +
   Pricing + Sales + Inventory Intelligence) and returns a strict superset of the base
   purchase metrics: `purchaseCount`/`purchaseValue`/`avgOrderValue`/`lastPurchaseDate`
   *plus* `revenueContribution`, `marginContributionPct`, `inventoryContribution`,
   `costTrend`, `priceStability`, discount stats, `preferredItemCount`. Using the
   narrower `purchaseIntelligence` source (the naive "just mirror the customer side"
   choice) would have left the more authoritative, already-built answer unused. Per your
   direction, Supplier Purchase Profile consumes `supplierIntelligence` directly.
2. **Full listing infrastructure already exists for suppliers, but didn't for
   customers.** Outstanding Summary (customer-side) needed a brand-new provider because
   no customer-listing function existed anywhere. Supplier Outstanding needs **zero** new
   provider — `suppliers.js`'s `listSuppliers()` already does everything required.

## 1. Architecture Review

No changes to `js/services/reporting/` — every filter key needed already existed.
Registry, Contract, Lifecycle, Context, Shell, Toolbar, Filter Bar, Print, Export all
reused exactly as every prior report established.

`reportingPlatform.test.html`: still **67/67** (no platform file touched).

- **Supplier Ledger**: `js/operationalReports/purchaseRegister.js` gained a second
  `ReportDefinition` (`supplier-ledger`, category `SUPPLIER`), `href: 'purchase-register.html'`
  — the identical, unmodified screen. Colocated in the same file as
  `purchaseRegisterReportDefinition`, mirroring exactly how Customer Ledger was added to
  `salesRegister.js`.
- **Supplier Purchase Profile**: new `js/operationalReports/supplierPurchaseProfile.js`
  (definition only) and new `supplier-purchase-profile.html`, structurally the same shape
  as `customer-purchase-profile.html`/`current-stock.html` (one BI call, then
  search/sort/pagination client-side) — but calling `supplierIntelligence`, not
  `salesIntelligence` or `purchaseIntelligence` directly.
- **Supplier Outstanding**: new `js/operationalReports/supplierOutstanding.js` and new
  `supplier-outstanding.html`. Unlike Outstanding Summary (customer), this screen calls
  `suppliers.js`'s existing `listSuppliers()` directly — true server-side pagination
  (`limit`/`offset`/`count`), the same shape Sales/Purchase/Stock Register use, not the
  single-fetch client-side-slice shape the BI-sourced reports use.

## 2. Data Provider Review

**Zero new provider files this milestone.** Every report reuses something that already
existed:

| Report | Reused | Not created |
|---|---|---|
| Supplier Ledger | `js/purchaseRegisterData.js` (unmodified) | `js/supplierLedgerData.js` |
| Supplier Purchase Profile | `supplierIntelligence.getSupplierMetricsSnapshot()` (public API) | `js/supplierPurchaseData.js` |
| Supplier Outstanding | `js/suppliers.js`'s `listSuppliers()` (unmodified) | `js/supplierOutstandingData.js` |

**One deliberate capability trade-off, disclosed rather than worked around**: Supplier
Outstanding does not declare a Balance Status filter the way Outstanding Summary
(customer) does. `listSuppliers()` has no such parameter; adding one would mean modifying
`suppliers.js` (out of scope — it belongs to and is tested for the Supplier Management
screen) or faking server-side filtering by capping the result set at some fixed size
(risking a financial report silently omitting real suppliers). Balance status is still
shown per row as a badge (Payable/Advance/Settled, computed client-side, presentation
only) — visible, just not filterable. The report's own CSV export loops the existing,
unmodified `listSuppliers()` inline (the same `fetchAllPages` convention every other
report uses, written as a local helper rather than a new named provider function, since
it exists only to back this one export button).

## 3. Capabilities

**Supplier Ledger**: identical to Purchase Register (Date Range, Supplier, Payment
Status, Search, sort, Load-more pagination, Print, full-filtered CSV export) — because it
is the same screen.

**Supplier Purchase Profile**:

| Capability | Implementation |
|---|---|
| Search | Supplier name |
| Sort by column | Name (A-Z), Purchase Value (highest first), Order Count (highest first), Last Purchase (most recent first), Days Since Last Purchase (highest first) |
| Pagination | "Load more" over the in-memory array |
| Print / Export | Same shared framework; CSV includes the extra Supplier-Intelligence-only columns (Revenue Contribution, Margin Contribution %, Cost Trend, Price Stability, Preferred Item Count) that Customer Purchase Profile has no equivalent for |

**Supplier Outstanding**:

| Capability | Implementation |
|---|---|
| Search | Supplier name/phone/GSTIN (via `listSuppliers()`'s own existing search columns) |
| Sort by column | Balance (Payable first — `listSuppliers()`'s own existing `sort:'balance'`), Name (A-Z) |
| Pagination | "Load more", true server-side (`.range()`), same convention as the ERP-sourced registers |
| Print / Export | Same shared framework |

## 4. Performance Observations

- Supplier Ledger: identical cost profile to Purchase Register.
- Supplier Purchase Profile: one cached BI call — but a more expensive one than Customer
  Purchase Profile's, since `supplierIntelligence.getSupplierMetricsSnapshot()` composes
  four sibling snapshots (Purchase + Pricing + Sales + Inventory) rather than one. Still
  a single call from this report's own perspective, and each sibling snapshot is
  independently cached, so repeat loads within a cache window cost nothing extra.
- Supplier Outstanding: identical cost profile to `suppliers.html`'s own supplier list —
  no additional cost from being independently discoverable as a report.
- Not measured against a live Supabase session — same disclosed environment limitation as
  every prior milestone here.

## 5. Regression Summary

- `reportingPlatform.test.html`: **67/67**, unchanged.
- `supplier-purchase-profile.html`, `supplier-outstanding.html`, `purchase-register.html`,
  and `reports.html` all verified headlessly (isolated Chrome profile): all redirect
  cleanly to `index.html` unauthenticated; every new import resolves `200`; only the
  pre-existing `favicon.ico` 404.
- `node --check` clean on all new/modified `.js` files and all affected pages' inline
  module scripts.
- **Not run**: authenticated interactive verification (no reachable seeded Supabase
  session in this environment — same disclosed limitation as every prior milestone here).

## 6. Files Modified

**New (5):**
- `js/operationalReports/supplierPurchaseProfile.js` — Report Definition + registration
- `js/operationalReports/supplierOutstanding.js` — Report Definition + registration
- `supplier-purchase-profile.html` — the Supplier Purchase Profile screen
- `supplier-outstanding.html` — the Supplier Outstanding screen
- `docs/reports/milestone-14B6-completion.md` — this report

**Modified (2):**
- `js/operationalReports/purchaseRegister.js` — `+1` `ReportDefinition`
  (`supplierLedgerReportDefinition`), `+1` register function
- `reports.html` — `+3` imports, `+3` idempotent register calls

**Untouched (deliberately):** `js/suppliers.js`, `js/purchaseRegisterData.js`, everything
under `js/services/reporting/` and `js/services/businessIntelligence/**`.

## 7. Milestone 14B — Final Status (All Six Sub-Milestones)

| Sub-milestone | Outcome |
|---|---|
| 14B.1 | Reporting Data Providers (foundation for the ERP-sourced reports) |
| 14B.2 | Sales Register — canonical reference implementation |
| 14B.3 | Purchase Register |
| 14B.4 | Stock Register, Current Stock, Low Stock (preset), Negative Stock (preset), Stock Movement Register (= Stock Register, no new work) |
| 14B.5 | Customer Ledger (reuse), Customer Purchase Profile (new, BI), Outstanding Summary (new, ERP) |
| 14B.6 | Supplier Ledger (reuse), Supplier Purchase Profile (new, BI), Supplier Outstanding (new, ERP, reused provider) |

**Reports independently discoverable in the Reports hub: 13** — Sales Register, Customer
Ledger, Purchase Register, Supplier Ledger, Stock Register, Current Stock, Low Stock,
Negative Stock, Customer Purchase Profile, Outstanding Summary, Supplier Purchase
Profile, Supplier Outstanding. **Screens: 8.** **New ERP data providers across all of
14B: 4** (`salesRegisterData.js`, `purchaseRegisterData.js`, `stockRegisterData.js`,
`customerOutstandingData.js`) — no fifth was needed for Supplier Outstanding.

## 8. Lessons Learned — Summary Across 14B.5/14B.6

The Customer/Supplier audits, taken together, confirm the repository-reality-over-symmetry
principle in both directions:
- Where infrastructure already existed for one side but not the other (Outstanding), the
  audit correctly produced *different* implementations (new provider vs. reused provider).
- Where a domain-specific asymmetry existed in Business Intelligence itself (Supplier
  Intelligence vs. no Customer Intelligence), the audit correctly routed to the richer,
  more authoritative source rather than mirroring the narrower one for consistency's own
  sake.
- Where the underlying data and screen were genuinely identical (Ledger reports, Stock
  Movement Register), the audit correctly declined to create anything new.

**Milestone 14B is complete.** Waiting for direction on Milestone 14C.
