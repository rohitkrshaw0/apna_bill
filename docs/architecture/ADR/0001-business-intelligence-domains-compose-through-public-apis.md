# ADR-0001 — Business Intelligence Domains Compose Through Public APIs

**Status:** Accepted

**Date:** 2026-07-29

**Supersedes:** None

**Superseded By:** None

---

# Context

During development of the Business Intelligence Platform, the first four domains
(Inventory, Purchase, Sales, and Pricing Intelligence) introduced reusable metrics,
calculators, aggregators, recommendation engines, and public API contracts.

When implementing Supplier Intelligence (Milestone 12E), a design decision was required.

One option was to query ERP data directly and recreate calculations already performed by
other Business Intelligence domains.

The alternative was to compose the existing domains exclusively through their public APIs.

This decision established the composition pattern for the entire Business Intelligence
Platform.

---

# Decision

Business Intelligence domains MUST compose sibling domains exclusively through their
published public APIs.

Domains MUST NOT:

- Query ERP data to recreate calculations that already exist elsewhere.
- Duplicate metrics, calculators, aggregators, rankings, or recommendations.
- Access another domain's internal implementation.

Domains MAY:

- Consume another domain's documented public API.
- Combine multiple public API results into a higher-level business model.
- Introduce new calculations only when no existing domain can reasonably provide them.

Composition SHALL always be preferred over duplication.

---

# Rationale

Using sibling public APIs provides several architectural benefits.

- Single source of truth for every business calculation.
- Reduced duplication.
- Lower maintenance cost.
- Consistent business rules across the platform.
- Independent evolution of intelligence domains.
- Stable extension points for future modules.

Supplier Intelligence demonstrated this pattern by composing Inventory, Purchase,
Sales, and Pricing Intelligence without introducing its own ERP data loader.

---

# Consequences

Positive

- Reuse increases as the platform grows.
- New intelligence domains become orchestration layers instead of analytics engines.
- Business rules remain centralized.
- Testing becomes simpler because domains can be validated independently.

Negative

- Domains depend on stable public API contracts.
- Changes to public APIs require careful versioning.
- Cold-cache composition may temporarily invoke the same dependency concurrently,
  making cache behavior an implementation concern rather than an architectural issue.

---

# Alternatives Considered

## Option A — Direct ERP Access

Each domain independently queries ERP data and performs its own calculations.

Rejected.

This duplicates business rules, increases maintenance, and allows inconsistent
results between intelligence domains.

---

## Option B — Shared Internal Utilities

Expose internal calculators directly between domains.

Rejected.

This tightly couples implementation details and prevents independent evolution.

---

## Option C — Public API Composition

Compose only through documented public contracts.

Accepted.

This provides clear boundaries while maximizing reuse.

---

# Implementation

This decision is implemented beginning with:

- Milestone 12E — Supplier Intelligence
- Continued by Milestone 12F — Business Dashboard

Representative composition flow:

ERP

↓

Inventory Intelligence

↓

Purchase Intelligence

↓

Sales Intelligence

↓

Pricing Intelligence

↓

Supplier Intelligence

↓

BusinessSnapshot

↓

Dashboard

---

# Compliance

Future Business Intelligence domains MUST satisfy all of the following.

✓ Prefer composition over duplication.

✓ Consume sibling public APIs.

✓ Never access another domain's internals.

✓ Introduce new calculations only when no reusable implementation exists.

✓ Preserve the Business Intelligence public API contract.

Failure to meet these requirements constitutes an architectural violation.

---

# References

- business-intelligence-platform.md
- business-intelligence.md
- business-intelligence-api.md
- Milestone 12E — Supplier Intelligence
- Milestone 12F — Business Dashboard
