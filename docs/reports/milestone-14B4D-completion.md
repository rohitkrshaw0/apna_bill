# Milestone 14B.4D Completion Report — Stock Movement Register (Architecture Validation)

**Status:** Validation complete. **No new code was written.** Per instruction: **STOP
here.** No commit, merge, tag, or push has been made. This closes out Milestone 14B.4
(Inventory Reports) in full.

## 0. Report Architecture Validation (performed before writing any code, as instructed)

**Question**: does `js/stockRegisterData.js` already provide the row-level transaction
dataset a Stock Movement Register would need, or is a new `js/stockMovementData.js`
required?

**Finding**: `stock_ledger`'s own schema comment (`schema.sql` line 199) reads
`-- 9. stock_ledger (company-scoped; every stock movement)` — the table is, by the
schema's own description, already "every stock movement." `js/stockRegisterData.js`
(14B.4A) already queries this exact table, row-level, with:

- Date Range (`txn_date`, `timestamptz`-aware end-of-day boundary)
- Item filter (`item_id`)
- Transaction-type filter (`STATUS` reused for `txn_type` — all 8 schema values: purchase,
  sale, sale_return, purchase_return, mfg_consume, mfg_produce, adjustment, opening)
- Search (`notes`)
- Sort (date ascending/descending, qty in/out)
- Item name/unit and batch number via display-only embeds
- Full Print/CSV export through the same shared shell/toolbar

**No field, filter, sort order, or column a "Stock Movement Register" would need is
missing.** This is not a "same provider, different default filters" situation the way
Low Stock/Negative Stock were relative to Current Stock (those needed a genuine new
preset — a pre-selected Stock Status value with no equivalent in the base report). There
is no analogous distinguishing default to set here: a Stock Movement Register's
Date Range/Item/Type/Search/Sort defaults would be identical to Stock Register's own.

**Conclusion: "Stock Movement Register" and "Stock Register" (14B.4A) are the same
report, named twice in the original brainstormed list — not two reports differing by
presentation.** Unlike Low Stock/Negative Stock (which warranted two new, lightweight
`ReportDefinition`s pointing at a shared screen via a real preset), this item warrants
**no new `ReportDefinition`, no new screen, no new provider, and no new preset URL** —
adding a second Registry entry pointing at an identical, unparameterized
`stock-register.html` would be a duplicate hub listing with zero behavioral difference,
not a distinct capability. That is the opposite of "prefer reuse over duplication," not
an application of it.

## 1. Decision

Do nothing further. `stock-register.html` / `js/stockRegisterData.js` / the
`stock-register` Report Definition (all from 14B.4A) already fulfill this item.

## 2. Files Modified

**New (1):**
- `docs/reports/milestone-14B4D-completion.md` — this report

**Not created (deliberately):** `js/stockMovementData.js`, `stock-movement-register.html`,
a `movement-register` (or similarly named) `ReportDefinition`.

## 3. Milestone 14B.4 (Inventory Reports) — Final Status

| Original list item | Outcome |
|---|---|
| Stock Register | Built (14B.4A) — `js/stockRegisterData.js`, `stock-register.html` |
| Current Stock | Built (14B.4B) — BUSINESS_INTELLIGENCE-sourced, `current-stock.html` |
| Low Stock | Preset of Current Stock (14B.4C) — no new screen |
| Negative Stock | Preset of Current Stock (14B.4C) — no new screen |
| Stock Movement Register | **Same report as Stock Register (14B.4D)** — no new screen |

**14B.4 is complete: two screens (`stock-register.html`, `current-stock.html`), five
discoverable Report Registry entries (`stock-register`, `current-stock`, `low-stock`,
`negative-stock` — the fifth list item resolved to the first, not a sixth entry), one
ERP data provider (`js/stockRegisterData.js`), zero duplicated screens, zero duplicated
providers.**

## 4. Lessons Learned / Notes for 14B.5 (Customer Reports)

1. **"Is this the same report under a different name?" is now a two-time-confirmed,
   standing question** — first for Low Stock/Negative Stock (same data, different
   preset — warranted two new lightweight registrations), now for Stock Movement Register
   (same data, same everything — warranted zero new registrations). Both outcomes are
   legitimate; the difference is whether a genuine, distinguishing default exists to
   present as a preset, not whether the underlying data matches.
2. **For Customer Reports (Customer Ledger, Customer Purchase History, Outstanding
   Summary)**, the same validation should run before any new file: does
   `js/salesRegisterData.js` (or a reused ERP function) already cover a "Customer Ledger"
   listing (dated invoice history filtered by one customer, which the Sales Register
   already supports via its own Customer filter), or is Outstanding Summary closer to a
   BUSINESS_INTELLIGENCE-shaped aggregate (`parties.current_balance` is already a stored,
   authoritative running balance — check whether it, or a BI aggregate over it, already
   covers "Outstanding Summary" before writing a new provider).

**Per instruction: STOP here.** Waiting for direction on Milestone 14B.5 (Customer
Reports).
