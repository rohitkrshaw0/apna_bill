# 0011. Accounting Validation — Contracts Throw, Business Rules Return a Result

Status: Accepted

## Context

Milestone 15A needs two different kinds of validation, and this repository already
contains two different live precedents for how validation reports failure:

- Every contract factory in this codebase (`createReportDefinition`,
  `createExtensionDefinition`, and now `createAccountDefinition`/`createJournalEntry`)
  throws a `TypeError` on a malformed input.
- `extensions/validation/dependencyValidator.js` and the `validateExtension()` composition
  around it return `{ isValid, errors: [{ code, message }] }`, formatted for display as
  `` `[${code}] ${message}` ``.

A journal entry's balance check (`validateJournalEntry` in
`js/services/accounting/validation/journalEntryValidator.js`) needs to decide which of
these two shapes to use — or whether to reconcile them. This is worth an explicit ADR
because it sets the rule for every accounting validator this platform or Milestone 15B
adds afterward, and because leaving the two live precedents unreconciled invites each
future validator to pick one arbitrarily.

## Decision

**Contract construction throws `TypeError`. Business-rule validation returns
`{ isValid, errors }`. `assertBalancedJournalEntry()` bridges the two for a fail-fast
caller.**

The two precedents are not actually in conflict — they answer different questions, and the
Accounting Platform needs both answers:

1. **A malformed definition (a number where a string goes, a missing required field) is a
   programmer error.** `createAccountDefinition`, `createJournalEntry`,
   `createFiscalPeriod`, and every `assertValidX*` structural check throw immediately,
   loudly, and un-swallowably — matching every other contract factory in this codebase.
   There is exactly one way to call these correctly, and a caller that gets it wrong should
   find out at the call site, not several steps later.

2. **An unbalanced journal entry, an entry referencing an unregistered account, or an entry
   dated outside an open fiscal period is not a programmer error — it is ordinary,
   expected user input.** A human entering a manual voucher can be wrong in several
   independent ways at once (unbalanced, *and* has an unknown account on one line, *and*
   is missing a fiscal period), and a future voucher-entry screen needs to show the user
   every one of those problems together, with a machine-mappable code per issue, not the
   first one re-thrown after each attempted fix. `validateJournalEntry()` therefore returns
   `{ isValid, errors: [{ code, message, ...details }] }`, reusing the exact shape and
   `` `[${code}] ${message}` `` formatting `dependencyValidator.js`/`validateExtension()`
   already established, via the shared `validation/validationResult.js` helpers.

**The bridge**: `assertBalancedJournalEntry(entry, options)` calls `validateJournalEntry()`
and throws a `TypeError` summarizing every failed rule if the result is invalid, otherwise
returns `true`. This exists so a fail-fast caller — the future 15B posting engine, which
must never persist an unbalanced entry under any circumstance — gets one throwing call
site, while a UI gets the full structured result, without either duplicating the rule
logic the other already has.

**Error codes are `SCREAMING_SNAKE` (`JOURNAL_ERROR_CODES.UNBALANCED`, matching
`dependencyValidator.js`'s convention); domain enum values stay `lowerCamel`
(`VOUCHER_TYPES.journal`, matching `reportContract.js`'s convention).** Both casings are
live, deliberate precedents in this codebase for two different kinds of constant, and this
decision keeps them distinct rather than "fixing" one to match the other.

## Alternatives considered

**Make everything throw, including business-rule validation** (one `TypeError` per call,
listing all failures in the message). Rejected: a `TypeError` message is a string a future
UI would have to parse to find out *which* line or *which* rule failed, defeating the
purpose of having error codes and structured details (`lineIndex`, `accountId`, computed
totals) at all. It would also make "show the user three problems at once" require catching
one throw and somehow continuing to check the rest — awkward and against the grain of how
exceptions are meant to be used.

**Make everything return a result, including contract construction** (`createAccountDefinition`
returns `{ value, errors }` instead of throwing). Rejected: this would be a repository-wide
deviation from every existing contract factory (reporting, extensions, jobs), for no
benefit in the cases that actually need it — a malformed contract call is a bug in the
caller's code, not user input, and every other platform in this codebase agrees that should
surface as an exception immediately.

**Introduce a third, hybrid return shape specific to accounting** (e.g. throw a custom
`ValidationError` subclass carrying a `.errors` array). Rejected: this adds a new error
type this codebase does not otherwise use, and still requires a `try/catch` at every call
site that wants the structured detail — no real advantage over returning
`{ isValid, errors }` directly, and it does not reuse `dependencyValidator.js`'s
already-proven shape.

## Consequences

- Every future accounting validator (15B's posting-pipeline checks, a future
  reversal-eligibility check) follows this same split: shape validation throws at
  construction, business-rule validation returns a result, and a throwing bridge function
  is added only where a fail-fast caller genuinely needs one.
- A future manual-voucher UI (15B+) can call `validateJournalEntry()` directly and render
  every error in `result.errors` without any `try/catch`, while a posting engine that must
  never write an unbalanced entry calls `assertBalancedJournalEntry()` and gets a single
  throwing checkpoint.
- `formatValidationErrors()` in `validation/validationResult.js` is the one place the
  `` `[${code}] ${message}` `` format is produced, so accounting's error strings and
  extensions' error strings stay visually consistent without either file importing the
  other.
- A contributor tempted to make `createJournalEntry()` also check balance (folding both
  concerns into one throw) should read this ADR first — the split is deliberate, not an
  oversight, and folding them back together would break the "hold and display an
  unbalanced draft entry" use case entirely.

## References

- `js/services/accounting/validation/journalEntryValidator.js` — the implementation
  (`validateJournalEntry`, `assertBalancedJournalEntry`)
- `js/services/accounting/validation/validationResult.js` — the shared result shape,
  reused from `extensions/validation/dependencyValidator.js`'s own convention
- `js/services/reporting/contracts/reportContract.js` — the throw-on-construction
  precedent this decision keeps for accounting's own contracts
- `docs/architecture/accounting-platform-architecture.md` §7 — the architecture reference
