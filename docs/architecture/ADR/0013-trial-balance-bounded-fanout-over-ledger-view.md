# 0013. Trial Balance Composes via Bounded Per-Account Fan-Out, Not a New SQL Object

Status: Accepted

## Context

Milestone 15F (Trial Balance Platform) needs, for a selected company and an optional
as-of date, every account's balance as of that date, bucketed into a Debit or Credit
column, with grand totals that must tie out. `v_journal_ledger_lines` (ADR-0012) already
gives a per-line, per-account running balance; the open question is how a *multi-account*
snapshot is correctly and efficiently derived from it, under a constraint set this
milestone's own review explicitly enumerated: historical as-of-date correctness, no
cached/persisted balances, no duplicated accounting logic, no new schema object beyond
what is strictly required, no RPC, and correct RLS.

Before writing any implementation code, a dedicated architecture review evaluated every
plausible single-query approach — `DISTINCT ON`, ranking window functions, `GROUP BY`
with a join-back, `LATERAL` joins, and CTEs/derived subqueries — specifically for
whether any of them can correctly answer "every account's balance as of an *arbitrary
past* date" in one PostgREST-composed query. This ADR records that review's conclusion,
because it is expensive to re-derive and because a future contributor extending this
pattern to Balance Sheet or P&L (15G/15H) needs to know the same limit applies there too.

## Decision

**Trial Balance is computed by a bounded, per-account fan-out — one call to the
already-existing `balanceAt()` (`js/ledgerData.js`, 15E) per account in the company's
chart of accounts, run in parallel via `Promise.all` — not by a new SQL view, RPC, or
any single-query technique.** No new database object of any kind is introduced.

### Why every single-query technique fails for a historical date

All of `DISTINCT ON (account_id) ORDER BY entry_date DESC`, a `ROW_NUMBER() OVER
(PARTITION BY account_id ORDER BY entry_date DESC)` ranked to 1, a `GROUP BY account_id`
computing `MAX(entry_date)` joined back for the balance, and a `LATERAL` join fetching
each account's "latest row" share the same structure: they **pick one row per account
first**, using the account's *globally* latest activity, and only afterward can an
as-of-date filter be applied. PostgREST cannot change this: a client-supplied
`.lte('entry_date', X)` is always composed as an **outer** `WHERE` around whatever a
view's own `SELECT` already produces — it cannot be injected into a position *inside*
the view's own query text, ahead of the pick. So for any of these four techniques, an
account with activity both before and after the cutoff either shows its *current*
balance (wrong) or disappears from the result entirely (also wrong), instead of showing
its balance as of the cutoff. CTEs and derived subqueries are purely organizational —
they carry the identical limitation, since a CTE inside a view is exactly as unable to
receive a client-supplied runtime value as a plain subquery is.

**The one single-query version that *is* correct requires an RPC.** `SELECT DISTINCT ON
(account_id) ... FROM v_journal_ledger_lines WHERE company_id = $1 AND entry_date <= $2
ORDER BY account_id, entry_date DESC, journal_no DESC, line_no DESC` is correct *only*
because the date bound is textually inside the same `SELECT`, ahead of the
`DISTINCT ON` — and the only way a client-supplied `$2` lands there is a parameterized
stored function. That is exactly the object ADR-0012 already reasoned this schema
should avoid (zero `SECURITY INVOKER` precedent anywhere in this codebase; a function
body is a planner optimization barrier a view is not), and this milestone's own scope
excludes introducing one.

### Why `balanceAt()` is not subject to this bug, and fan-out over it is correct

`v_journal_ledger_lines.running_balance` is a **prefix sum**
(`SUM() OVER (... ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)`), not a
collapse-to-one-row pick. Every row's own `running_balance` is a function of everything
at or before it, computed unconditionally by the view; removing later rows via an outer
`.lte('entry_date', X)` filter can never change an earlier surviving row's own prefix
sum. So `balanceAt()`'s query shape — filter to `entry_date <= X`, then take the latest
survivor — is exactly correct: that survivor's own `running_balance` already *is* the
balance as of `X`. This is the opposite operation from a row-pick, and it is why fanning
out this already-correct, already-existing function once per account is sound, while
building a second, collapsing view on top of it for "all accounts at once" would
silently reintroduce the exact bug the prefix-sum design avoids.

### Why fan-out, not a client-side loop over raw lines

The fan-out is bounded by **chart-of-accounts size** (typically tens of accounts for an
SMB), not by transaction volume — the same category of bounded, parallelizable
small-query fan-out `journalRegisterData.js`'s own linked-entry lookup (15D) already
uses, not the "fetch every transaction row, filter/paginate in application code"
anti-pattern this codebase has previously rejected. No journal line or journal entry is
ever fetched by Trial Balance directly; only one pre-aggregated `running_balance` value
per account, per request.

## Alternatives considered

**A new materialized/cached "current balance per account" table, refreshed on every
post.** Rejected outright by this platform's standing posture (15A onward): nothing
about an account's balance is ever cached or persisted, and a materialized snapshot
would need its own invalidation story on every `post_journal_entry()`/
`reverse_journal_entry()` call this milestone has no mandate to build.

**A dedicated `get_trial_balance(company_id, as_of_date)` RPC**, computing the correct
single-query `DISTINCT ON`-with-inline-filter shown above. This is the technically
cleanest single-query solution, and is explicitly the fallback this ADR names below — but
it is out of scope for this milestone specifically because it is an RPC, and this
schema's only two write RPCs (`post_journal_entry`, `reverse_journal_entry`) are both
`SECURITY DEFINER` with manually-coded membership checks; a read-only RPC here would
either need to repeat that pattern for no write it is doing, or become this schema's
first `SECURITY INVOKER` function with no precedent to model it on. Deferred, not
rejected — see the performance threshold below.

**Client-side balance computation over raw journal lines**, bypassing `balanceAt()`/the
view entirely. Rejected: this is precisely the duplicated-accounting-logic and
client-side-balance-computation outcome every accounting milestone since 15A has
avoided, and it would not even be simpler than the chosen approach — it would require
this file to reimplement the exact prefix-sum/normal-balance-direction logic the view
already provides for free.

## Consequences

- Trial Balance introduces zero new database objects — `schema.sql`, `accounting_rpc.sql`,
  and RLS are all untouched by this milestone.
- `js/ledgerData.js`'s `balanceAt()` is promoted from a private helper to an exported
  one, and its own doc comment now explains the prefix-sum property this ADR depends on
  — a future reader of that function sees why it is safe for a historical date without
  having to re-derive the reasoning from this ADR alone.
- **Explicit performance threshold for reconsidering an RPC**: if a company's chart of
  accounts grows large enough (rough guide: several hundred active accounts) that the
  bounded fan-out becomes a *measured*, not merely theoretical, latency problem for this
  screen, that is the trigger to introduce `get_trial_balance(company_id, as_of_date)` as
  a new, separately-approved RPC decision — not something to pre-build speculatively
  against a problem that has not been observed.
- A future Balance Sheet (15G) or Profit & Loss (15H) milestone facing the identical
  "every account as of a date" shape should read this ADR first: the same fan-out
  pattern applies, and the same RPC-threshold reasoning governs when (if ever) to
  reconsider it.
- A future contributor tempted to "optimize" Trial Balance into a single `DISTINCT ON`
  view should read the proof above first — it is not an oversight to fix, it is a
  correctness boundary this ADR exists to make visible.

## References

- `js/ledgerData.js` — `balanceAt()` (the reused, already-correct per-account query) and
  `bucketSignedBalance()` (the shared, pure Debit/Credit presentation logic Trial
  Balance and the General Ledger both call, so neither duplicates it)
- `js/trialBalanceData.js` — the implementation (`getTrialBalance`,
  `buildTrialBalanceRows`)
- `docs/architecture/ADR/0012-ledger-view-as-canonical-running-balance-projection.md` —
  the view this milestone composes on, and the `SECURITY INVOKER`/planner-barrier
  reasoning this ADR's RPC alternative reuses rather than re-deriving
- `docs/architecture/ADR/0010-account-open-catalog-closed-derivation.md` — the
  `normal_balance` source of truth `bucketSignedBalance()` reuses, never re-derives
- `docs/architecture/accounting-platform-architecture.md` §15 — the architecture
  reference
