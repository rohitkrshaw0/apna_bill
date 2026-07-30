# 0003. Reporting Platform Foundation — Registry Shape, Permissions, and Extension Points

Status: Accepted

## Context

Milestone 13D's gap analysis established that no Reporting Engine existed anywhere in
ApnaBill. Milestone 14A was scoped to build the foundation for one — a registry,
contracts, lifecycle, context, shared shell, print framework, and export framework —
without building any actual report. Three design decisions in that foundation are
non-obvious enough, and expensive enough to re-derive from the completion report alone,
to warrant their own record here, per this directory's own "introduces a genuinely new
architectural pattern" / "would be expensive to re-derive" criteria.

The repository already has five precedents for "how does a platform let other code
extend it": the Domain Event Bus's `EVENT_TYPES` catalog, the Background Job Engine's
fixed `JOB_IDS` enum, the Audit Platform's `AUDIT_RECORD_VERSIONS` registry, the Plugin &
Extension Framework's dynamic `extensionRegistry`, and Business Intelligence's
`BI_CAPABILITIES` capability names. The Reporting Platform needed to pick the right one
of these shapes to follow, not invent a sixth.

## Decision

**1. The Report Registry is dynamic, modeled on `extensionRegistry.js`, not a fixed enum
like `JOB_IDS`.** `registry/reportRegistry.js`'s `register(definition)` runs a
duplicate-id check at call time against whatever is already registered — there is no
upfront `REPORT_IDS` catalog a new report's id must already appear in. Reports are
expected to be registered incrementally by future milestones (14B, 14C, …), the same
growth pattern extensions have, not a small, developer-curated set known in advance the
way the Background Job Engine's three jobs are.

**2. `reportRegistry.register()` is itself this platform's extension point.** No new
capability was added to `js/services/extensions/capabilityNames.js` — that file lives
inside the frozen Extension Framework, and 14A's own brief forbids modifying any frozen
system without separate, explicit approval. Every future report registers by calling
`register()` directly on the shared `reportRegistry` instance; nothing about the
registry, contract, or index barrel needs to change for a new report to exist.

**3. Report permissions are a carried, validated, but explicitly UNENFORCED contract
field.** `contracts/reportContract.js`'s `ReportDefinition.requiredCapability` is
validated for shape (a non-empty string, when present) and threaded through
`registry/reportRegistry.js` and `context/reportContext.js` unchanged — but no function
anywhere in this platform checks it against anything. There is no roles/permissions model
anywhere in this application to gate against, and Authentication is explicitly frozen for
this milestone. Building a real authorization engine to make this field meaningful would
be inventing a new system this milestone was never asked to build.

## Alternatives considered

**Registry shape — a fixed `REPORT_IDS` enum, matching `JOB_IDS`.** Rejected: the Job
Engine's catalog fits a small, rarely-changing set of background jobs the *platform
maintainers themselves* define. Reports are the opposite case — an open-ended set that
different future milestones will keep adding to, closer in spirit to how extensions are
registered than to how jobs are.

**Extension point — add `ReportProvider` to `BI_CAPABILITIES`/`capabilityNames.js` now, so
extensions can contribute reports from day one.** Rejected: that file belongs to the
frozen Extension Framework. Business Intelligence already has a live example of the
*safer* version of this same choice — `DashboardCardProvider` is "declared but not yet
wired" (`business-intelligence-platform.md` §7) — proving a capability can be added later,
once a real consumer needs it, without having existed prematurely.

**Permissions — skip the field entirely until a real permissions model exists.**
Rejected: omitting the field now means every future report definition written against
this contract would need a breaking, additive migration later to add it back in. Carrying
it, validated but inert, costs nothing today and avoids that migration — the same
reasoning that already justified the Job Engine's unused `CANCELLED` state existing ahead
of any caller that invokes it.

**Permissions — build a minimal enforcement gate now** (e.g., checking
`requiredCapability` against something in `localStorage`). Rejected outright: there is no
real roles/permissions model to check against, so any gate built today would be
security theater — a check that looks like protection but enforces nothing meaningful,
worse than no gate at all because it invites false confidence.

## Consequences

- A future milestone can register a real report with zero change to
  `js/services/reporting/registry/reportRegistry.js`, `contracts/reportContract.js`, or
  `index.js` — the whole point of the registry/contract split, the same benefit
  `job-engine-architecture.md` §11 documents for its own registry/dispatcher split.
- `requiredCapability` must never be treated as a security boundary by any future
  contributor — `docs/architecture/reporting-platform-architecture.md` §6 states this
  explicitly, and this ADR is the permanent record of why the field exists without an
  enforcement mechanism.
- If a future milestone wants extensions to contribute report definitions, it must
  explicitly add and wire a new capability to `capabilityNames.js` — a deliberate,
  separately-approved change to the Extension Framework, not an automatic consequence of
  this ADR.
- If a future milestone wants real permission enforcement, it needs its own Authentication
  /roles milestone first; this ADR's `requiredCapability` field is the seam that future
  work plugs into, not a shortcut around needing it.

## References

- `docs/reports/milestone-13D-completion.md` — the gap analysis this foundation resolves
- `docs/reports/milestone-14A-completion.md` — what was built and verified
- `docs/architecture/reporting-platform-architecture.md` — the full architecture reference
- `docs/extension-framework-architecture.md` §8 (Capability Registry — decoupling, not
  automatic resolution) — the precedent this ADR's decision 2 follows
- `docs/job-engine-architecture.md` §5, §11 (`CANCELLED` reserved-but-unused; registry/
  dispatcher split) — the precedent this ADR's decisions 1 and 3 follow
- `docs/architecture/business-intelligence-platform.md` §7 (`DashboardCardProvider`
  declared but not yet wired) — the precedent this ADR's decision 2 follows
