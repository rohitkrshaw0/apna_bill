# Milestone 12F — Business Dashboard Platform: Design

## 1. Goals

Extend the Business Intelligence platform (Milestones 12A–12E) with a sixth, read-only,
CONSUMER-ONLY domain: the Business Dashboard. Per this milestone's own "MOST IMPORTANT
RULE" ("THE DASHBOARD MUST CONTAIN ZERO BUSINESS LOGIC"), it introduces two new platform
concepts — `BusinessSnapshot` (an immutable, composed object representing the complete
business state) and its `BusinessSnapshotProvider`, plus a `DashboardProvider` that maps
a snapshot into 17 renderable Dashboard Cards — without computing a single new number,
percentage, ranking, or formatted string anywhere in this domain's own files.

## 2. Current architecture (as it exists today)

Read in full before any code was written: `docs/architecture/platform-roadmap.md`,
`docs/architecture/business-intelligence.md` (§§1–23 as 12E left them),
`docs/architecture/business-intelligence-api.md` (the full public contract as 12E left
it, including its §14.1 "Business Dashboard — reserved" placeholder), all five prior
milestones' design/completion docs, and every file under
`js/services/businessIntelligence/` as 12E left it — in particular all five domains' own
`api/createXIntelligenceApi(...)` composition roots and their own `getXSummary()`
functions' exact return shapes. Two facts from that reading shaped this design directly:

1. **Every domain's own `getXSummary()` already returns a fully-assembled, deep-frozen
   model with its own `.recommendations` field.** This milestone's entire distinguishing
   value is composing five already-complete pictures into one, not computing a sixth.
2. **Supplier Intelligence (12E) already proved the "compose sibling APIs, not a
   loadSnapshot" composition-root shape works** at four-domain scale. This milestone
   takes it one domain further (five, one of which is itself a four-domain composer) —
   the pattern, not the domain count, was the open question, and 12E had already
   answered it.

## 3. Non-goals (explicit, from the brief)

Not built here: any UI component or rendering code (Dashboard Components — "Dashboard
components display information" is a future milestone's own job, explicitly out of
scope for this one), any change to Inventory/Purchase/Sales/Pricing/Supplier/Manufacturing
workflow, any database schema change, any API breaking change, any new metric,
calculator, or aggregator (confirmed zero new files under `metrics/`, `calculators/`, or
`aggregators/` — the strictest "no new calculation" constraint any milestone in this
platform has had), any new background job (§4 below explains why none was needed), and
any literal calendar-day "today" query (no existing BI aggregator exposes daily
granularity, and creating one was explicitly forbidden). Not modified here: any file
Milestones 12A–12E already built, beyond the two additive registry entries (`events/registry/eventTypes.js`,
`audit/registry/auditRegistry.js`) and `index.js`'s own barrel append — `shared/config.js`
was not touched at all, the first milestone since 12A with nothing to add there.

## 4. Key design questions answered

**Why does `dashboard/businessSnapshotProvider.js` have no data loader, unlike every
domain except Supplier Intelligence?** Because this milestone's own architecture diagram
("Business Intelligence -> Business Snapshot Provider -> Dashboard Provider -> Dashboard
Components -> UI") places it strictly ABOVE the Business Intelligence layer, never
beside or below it — its only inputs are five already-frozen summary models, called via
each domain's own public `getXSummary()` function.

**Why does `getBusinessSnapshot()` call `getInventorySummary()`/`getPurchaseSummary()`/
etc. — the FULL company-wide summary — rather than a narrower function like
`getInventoryValue()`/`getRevenueSummary()`?** Because the Dashboard's own value
proposition is showing the COMPLETE picture each domain already assembled (including its
own category performance, trend buckets, and recommendations) in one object, not a
curated subset — narrower functions exist for callers that want less, but
`BusinessSnapshot` is deliberately the "everything" object this milestone's own brief
names it as.

**Why is `dashboardCards` NOT a field on the implemented `BusinessSnapshot`, even though
this milestone's own illustrative example lists it as one?** Because the same brief's
own architecture diagram draws `Dashboard Provider` as a SEPARATE, downstream box from
`Business Snapshot Provider`, and its own "Every dashboard card consumes this object.
Nothing else." reads most consistently as "cards are DERIVED FROM a snapshot," not
"stored on one." Keeping `businessSnapshotProvider.js` free of card-shaping concerns
(title strings, `kind` labels) also keeps it reusable by a future consumer (a Mobile App,
say) that wants the raw snapshot without any Dashboard-specific card mapping at all. This
interpretation is disclosed explicitly, not silently substituted for the brief's own
illustrative wording.

**Why is "alerts" a legitimate composition, not a forbidden "new calculation"?** Because
every alert is a FILTER over an already-computed, already-named boolean field
(`lowMarginWarning`, `priceIncreaseWarning`, `supplierReviewNeeded`, etc.) — no new
boolean is derived, no arithmetic happens, only a `.filter()` call selecting rows already
flagged true by their own domain. `inventory`'s own alerts go further: they reuse
`getReorderRecommendations()`'s own already-actionable-only list verbatim, with no
filtering of any kind needed. This is the same category of operation
`aggregators/worstSellingItemsAggregator.js` (12C) or any other aggregator's own
`.sort()`/`.slice()` already perform — selection, not calculation.

**Why was no `refreshDashboardInsightsJob.js` created, when every domain from 12A
through 12E registered its own job?** Because `insightCache.invalidateCompany(companyId)`
— already called by all five existing refresh jobs — clears EVERY cache-key prefix for
that company, `businessSnapshot:...` included, regardless of which job triggered it.
Registering a sixth job with the identical `invalidateCompany()` call any existing job
already makes would be a literal duplicate scheduler, which this milestone's own
"BACKGROUND JOBS" section explicitly forbids ("Do NOT create another scheduler"). This
is the most literal possible compliance with that rule: zero new jobs, not a narrowly
scoped one.

**Why does composing Supplier Intelligence (itself a four-domain composer) inside a
five-domain composition create a disclosed, not silently ignored, cache race?** Because
`Promise.all` starts all five `getXSummary()` calls concurrently, and
`supplierIntelligence.getSupplierSummary()` independently calls
`purchaseIntelligence.getPurchaseMetricsSnapshot()` too (per its own 12E design) — on a
COLD cache, both the direct call (this domain's own `purchaseIntel.getPurchaseSummary()`)
and the indirect one can each miss the same not-yet-populated cache entry before either
finishes populating it, causing one extra load. This was caught during test construction
(§5) and is disclosed here and in the architecture reference rather than silently
"fixed" by adding synchronization machinery this milestone's brief never asked for — it
self-corrects completely on every call after the first.

## 5. Testing approach

Same convention as `supplierIntelligence.test.html` (12E): a flat, dependency-free
`businessDashboard.test.html`, no build step, run headlessly via `python -m http.server`
+ `chrome --headless=new --dump-dom`. Deliberately reuses the EXACT SAME fixture
`supplierIntelligence.test.html` already built and hand-verified (three suppliers with
distinct performance profiles, a multi-sourced item, a never-sold item) rather than
re-deriving one, since this milestone's own job is composition correctness across five
already-independently-tested domains, not re-verifying arithmetic their own suites
already cover. Wires that fixture into five isolated sibling API instances (one of which,
Supplier Intelligence, itself wires the other four), then into `createDashboardApi()`.
One real, disclosed race condition was caught during construction — an exact
sibling-load-count assertion after the FIRST (cold-cache) call to `getBusinessSnapshot()`
was flaky, because `purchaseIntelligence.getPurchaseMetricsSnapshot()` can legitimately
be reached twice concurrently on that first call (§4's own answer). Fixed by asserting
cache behavior the way that actually matters — a REPEAT call touches no sibling API at
all — rather than a brittle absolute count on the first, necessarily-concurrent one. The
full existing regression suite (19 prior test files) was re-run after every change to
confirm zero regressions, including `jobEngine.test.html`, which needed NO update this
time (still the same job count as 12E left it) — confirming the "no new job" design
decision (§4) was correctly load-bearing, not just theoretically sound.

## 6. Reading order for whoever picks this up next

1. `docs/architecture/business-intelligence.md` §24 (the full architecture reference for
   this milestone).
2. `docs/architecture/business-intelligence-api.md` §9 (the full public API contract).
3. `docs/reports/milestone-12F-completion.md` (this milestone's completion report,
   including its own mandatory Reuse Audit).
4. `js/services/businessIntelligence/businessDashboard.test.html` (the fixture and every
   check, as executable documentation of the composition/selection logic this design
   discusses).
