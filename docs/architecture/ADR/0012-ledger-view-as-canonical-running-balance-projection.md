# 0012. `v_journal_ledger_lines` as the Canonical Running-Balance Read Projection

Status: Accepted

## Context

Milestone 15E (General Ledger Platform) needs a scalable per-account running balance:
for a selected account, every journal line affecting it, in chronological order, each
carrying the account's cumulative balance as of that line. `journal_entries`/
`journal_lines`/`accounts` (15B) have no cached or persisted balance column anywhere —
by design, per this platform's "derive, never cache" posture — so a running balance has
to be computed at read time, over a table that can grow unboundedly.

Two live-tested facts ruled out the two most obvious approaches before this ADR was
written:

- **PostgREST aggregate functions are disabled on this project.** Confirmed live, not
  assumed: a `sum()`/`count()` aggregate through the REST API returns `400 PGRST123`.
  This forecloses computing a running balance by asking PostgREST to aggregate
  client-side-visible rows.
- **This repository has zero precedent for a `security invoker` function.** Every
  existing accounting RPC (`next_journal_number`, `post_journal_entry`,
  `reverse_journal_entry`, `accounting_rpc.sql`) is `security definer` with manual
  `is_member_of_company`/`is_owner_of_company` checks. A `security invoker` running-
  balance RPC would be architecturally novel for this specific reason, not a drop-in
  extension of an existing pattern, and a plpgsql function body is an optimization
  barrier to the query planner in a way a plain view is not — server-side filtering/
  pagination composed on top of an RPC's result set cannot be pushed down into the
  RPC's own query the way it can be inlined into a view.

A repository-grounded comparison across both options (correctness under RLS, planner
behavior, composability with `.eq()`/`.range()` filtering, precedent, and how cleanly
future reports reuse the same balance logic) concluded a plain, non-materialized SQL
**view** is the better fit for this codebase specifically — not a generic "views beat
RPCs" claim. This decision was reviewed and approved before any implementation began.

## Decision

**`v_journal_ledger_lines` (defined in `schema.sql`) is the one, canonical, read-only
projection every ledger-derived screen composes on top of, rather than each screen or
future milestone re-deriving running balance independently.**

The view joins `journal_lines`/`journal_entries`/`accounts` (nothing else — no customer/
supplier name, no inventory metadata, no GST presentation, no UI formatting) and computes
`running_balance` with a SQL window function:

```sql
sum(
  case when a.normal_balance = 'debit' then jl.debit - jl.credit
       else jl.credit - jl.debit end
) over (
  partition by jl.company_id, jl.account_id
  order by je.entry_date, je.journal_no, jl.line_no
  rows between unbounded preceding and current row
)
```

partitioned per `(company_id, account_id)` so the running total never leaks across
accounts or companies, ordered by `(entry_date, journal_no, line_no)` — the same
chronological/document-order key `journalRegisterData.js` already sorts by — and
direction-aware via `accounts.normal_balance`, the single existing source of truth for
balance direction (ADR-0010); this decision does not introduce a second one.

**RLS is inherited, not redeclared — but only because the view is explicitly
`security_invoker = true`, not merely because it is "a plain view."** A view has no RLS
policies of its own to write; the intent was always that querying it re-runs the SELECT
policies already on its base tables (`je_select`/`jl_select`/`accounts_select`, unchanged
since 15B) for every row it produces. That intent was live-verified to be **wrong by
default**: a Postgres view without `security_invoker = true` runs its underlying query as
its *owner*, not the querying role, and on Supabase an object created through the SQL
Editor is owned by `postgres` — a role with BYPASSRLS. A `security_invoker`-less version
of this exact view was tested live during this milestone's own validation and returned
every company's ledger lines to an anonymous, unauthenticated request, RLS on the base
tables notwithstanding. Adding `security_invoker = true` to the view's definition
(`schema.sql` §29) fixed this: it makes the view execute with the *invoker's* own
privileges, so `je_select`/`jl_select`/`accounts_select` are genuinely re-evaluated for
the actual caller on every query — the same as querying the base tables directly. This
correction is recorded here, not silently folded into a rewritten "the view was always
correct" account, because a future contributor adding a second view to this schema should
know the failure mode is real and live-verified, not hypothetical — and must add
`security_invoker = true` deliberately, not assume it's the default.

**Being a plain (non-materialized) view means the planner inlines it into the querying
statement.** A caller's `.eq('account_id', x).gte('entry_date', y).range(...)` is not
"compute the whole view, then filter/paginate in application code" — it composes into one
planned query, the same way filtering a table directly would, which a `security definer`
plpgsql function's own query could not offer.

**Every future ledger-derived screen — Trial Balance (15F), Profit & Loss (15G), Balance
Sheet (15H) — composes on `v_journal_ledger_lines` for its own balance needs rather than
re-deriving running balance from `journal_lines`/`journal_entries`/`accounts` directly.**
A future milestone that finds itself writing a second window-function running-balance
query against those three tables should read this ADR first: that need almost certainly
belongs as a query against this view, not a second independent derivation.

## Alternatives considered

**A `security invoker` RPC computing the running balance server-side.** Rejected: this
repository has zero precedent for `security invoker` on any accounting function (every
existing one is `security definer` with manual membership checks), making it a novel
pattern introduced for one milestone rather than an extension of anything established;
and a plpgsql function body is a planner optimization barrier, so filtering/pagination
composed on top of its result would not push down into the RPC's own query the way it
does against a plain view.

**A `security definer` RPC, matching every other existing accounting RPC's actual
precedent.** Rejected for the same composability reason — the precedent match doesn't
change the planner-barrier problem — and additionally worse here: `security definer`
would require re-implementing the membership check the base tables' RLS already performs
for free through a view, duplicating logic this milestone has no reason to duplicate.

**Compute the running balance client-side, in `js/ledgerData.js`, after fetching raw
lines.** Rejected outright by the milestone's own constraint (zero client-side balance
computation) and rejected on merits regardless: it does not scale past however many lines
a page can hold in memory, defeating the entire reason a database-side running balance
was needed in the first place.

**A cached/materialized balance column or table, refreshed on every post.** Rejected:
this platform's established posture (15A onward) is that nothing about an account's
balance is ever cached or persisted — it is always derived from `journal_entries`/
`journal_lines` at read time. A materialized balance would be the first exception to
that rule, and would need its own invalidation story on every `post_journal_entry()`/
`reverse_journal_entry()` call this milestone has no mandate to build.

## Consequences

- General Ledger (15E) is a straightforward filtered/sorted/paginated query against
  `v_journal_ledger_lines`, with no balance arithmetic anywhere in `js/ledgerData.js` or
  `ledger.html`.
- Trial Balance (15F) can compute each account's period-end balance as one more query
  shape against this same view (the latest `running_balance` per account as of a cutoff
  date) instead of a new derivation.
- Profit & Loss (15G) and Balance Sheet (15H) can do the same for income/expense and
  asset/liability/equity accounts respectively — the view does not care which category an
  account belongs to, only which account it is.
- If a future milestone needs a projection this view cannot serve (e.g. a
  multi-account, cross-account aggregate query PostgREST's disabled aggregates still
  cannot answer), that is new information this ADR did not have, and should prompt a new
  ADR superseding or extending this one — not a silent second running-balance
  implementation living beside this view.
- A future contributor extending the accounting schema with a new base column should
  check whether `v_journal_ledger_lines`'s select list needs the same column, since the
  view does not pick up new base-table columns automatically.
- Any future view added to this schema (a Trial Balance or Balance Sheet aggregate view,
  should one ever be added instead of a query composed in application code) must declare
  `security_invoker = true` explicitly and have that declaration live-verified with an
  anon/no-JWT request before being considered RLS-safe — "it's a plain view over
  RLS-protected tables" is not sufficient on its own, per this ADR's own live finding.

## References

- `schema.sql` §29 — the implementation (`v_journal_ledger_lines`)
- `js/ledgerData.js` — the sole consumer as of 15E (`getLedgerPage`, `balanceAt`)
- `docs/architecture/ADR/0010-account-open-catalog-closed-derivation.md` — the
  `normal_balance` source of truth this view's direction logic reuses, never re-derives
- `docs/architecture/ADR/0004-reporting-data-access-strategy.md` /
  `docs/architecture/ADR/0005-operational-report-data-provider-pattern.md` — the
  server-side filter/sort/paginate convention this view's composability preserves
- `docs/architecture/accounting-platform-architecture.md` §13 — the architecture reference
