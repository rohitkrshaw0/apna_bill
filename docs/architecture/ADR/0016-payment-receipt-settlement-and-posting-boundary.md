# 0016. Payment & Receipt Settlement and Its Posting Boundary

Status: Accepted

## Context

Milestone 15H left every ledger-derived screen (General Ledger, Trial Balance, Profit &
Loss, Balance Sheet) structurally correct over an economically incomplete ledger: every
`insert into payments` in the repository sat inside `create_sale()` (`sale_rpc.sql:288`),
`create_purchase()` (`sale_rpc.sql:466`), or the backup restore path
(`restore_rpc.sql:158`). No screen, RPC, or posting provider recorded a payment arriving
*after* a document was created. `create_sale()`'s own `current_balance += (grand_total -
amount_paid)` and `create_purchase()`'s mirrored `current_balance -=` meant a receivable or
payable could only ever grow. `js/customerOutstandingData.js`'s own header, written for the
Milestone 14B.5 audit, recorded the same finding independently: *"There is no separate
later-payment-recording RPC anywhere in this schema that could let it drift out of sync
with invoices."* Milestone 15I is precisely the milestone that introduces such a path, which
makes not letting it drift the milestone's central obligation.

`journalContract.js` had already reserved `VOUCHER_TYPES.PAYMENT`/`RECEIPT` and
`POSTING_SOURCES.PAYMENT` with zero call sites, and `accountResolutionContract.js` named
"payments" as a future provider — the vocabulary existed; nothing used it.

Four decisions had to be made before any code was written, none of which the existing
architecture answers by itself.

## Decision

### 1. Settlement is atomic through one new RPC; posting stays a separate best-effort step

`record_payment(payload jsonb)` (`accounting_rpc.sql`) is the only way a post-invoice
settlement is recorded. In one transaction it inserts a `payments` row, decrements the
settled document's `amount_paid`/`amount_due` (`invoices` for a receipt, `purchases` for a
payment), and adjusts `parties.current_balance` — the identical row-locked update shape
`create_sale()`/`create_purchase()` already use for the same columns at invoice time.
PostgREST has no client-side transaction; four sequential REST calls could partially fail
and leave `current_balance` permanently disagreeing with the document rows, which is
exactly the corruption the 14B.5 audit identified as the thing an RPC boundary prevents.

`record_payment()` writes **no journal entry**. Posting stays exclusively with
`post_journal_entry()`, called by the client through `AccountingPlatform.post()` as a
second, best-effort step — the identical two-step contract 15B established for Sales,
Purchase, and Manufacturing, where a posting failure never rolls back the underlying
business transaction. This is not a second posting mechanism; it is the same one, with two
new voucher types (`receipt`, `payment`) and two new posting providers
(`receiptPostingProvider.js`, `paymentPostingProvider.js`) registered onto the existing
`postingProviderRegistry`, resolving accounts through the existing Account Resolution
Service exactly as every prior provider does.

### 2. Document-level allocation via `payments.invoice_id`; no allocations table

Outstanding is tracked at two granularities that must stay consistent: party-level
(`parties.current_balance`) and document-level (`invoices.amount_due` /
`purchases.amount_due`). One `record_payment()` call settles exactly one document. On the
sales side this is `payments.invoice_id`, already singular — no schema change. On the
purchase side, **`payments` has no `purchase_id` column and never has** —
`create_purchase()`'s own existing payment insert already passes `invoice_id = null` for a
purchase payment, so a supplier payment has never been traceable back to its purchase row
through the `payments` table itself, even before this milestone. `record_payment()`
inherits that shape rather than fixing it: it takes `_purchase_id` as an RPC argument and
updates the named `purchases` row directly, without persisting the link on the `payments`
row. This is a disclosed limitation (see Consequences), not a regression 15I introduces —
adding a `payments.purchase_id` column was in scope for consideration but rejected here to
keep the schema footprint at exactly one function, matching the approved decision that no
new table, column, view, index, or policy ships in this milestone.

A payment amount that exceeds its target document's own `amount_due` is rejected outright
by `record_payment()` (`amount % exceeds outstanding amount %`). This repository has no
overpayment/credit-note representation at the document level (only `parties.current_balance
< 0`, a party-level bucket Outstanding Summary already reads), so `record_payment()` does
not invent one.

### 3. Every settlement debits/credits `cashAccount`; `payment_type` is descriptive only

`payment_types` is `name`/`is_active`/`sort_order` only — no account mapping — and the
16-account seed `bootstrap_accounting_defaults()` creates has no bank account. A UPI, card,
or cheque receipt therefore has nowhere else to land. `receiptPostingProvider.js` and
`paymentPostingProvider.js` both resolve only `cashAccount` for the cash leg, mirroring what
`salesPostingProvider.js`/`purchasePostingProvider.js` already do for the amount received/
paid at invoice time — this is not a new inaccuracy 15I introduces, it is the existing one,
extended consistently to the settlement path. `payment_type_id` is still recorded on the
`payments` row and shown in the UI; it is never resolved into an account.

### 4. Payments are immutable in 15I; no void/edit/reversal path

No document in this application can be voided or edited after creation — there is no
`cancel_sale()`, no `delete_purchase()`, and `reverse_journal_entry()` reverses only the
ledger side, never the ERP side. Inventing a payment-specific void here would set a
void-semantics precedent for the whole application without the design attention that
deserves. A correction in 15I is made through Manual Journal against the ledger; the ERP-
side `payments`/`amount_due`/`current_balance` correction workflow is explicitly deferred to
a future milestone.

### 5. Historical invoice-time payments are never re-posted; the `ref_table` key spaces stay separate permanently

Invoice-time payments (the `amount` paid inside `create_sale()`/`create_purchase()`) were
folded into the sale/purchase's own journal entry, posted under `ref_table = 'invoices'` /
`'purchases'`. New settlements post under `ref_table = 'payments'`. `idx_je_ref`'s unique
index on `(company_id, ref_table, ref_id)` keeps each idempotent, and the two key spaces
never collide — **provided no backfill of historical `payments` rows into new journal
entries is ever run.** This prohibition is permanent, not a 15I-only rule: a future milestone
that touches historical payment data must not construct a `ref_table = 'payments'` entry for
a payment row that predates this milestone.

## Alternatives considered

**A `payment_types.account_id` mapping plus a seeded bank account (Decision 3).** More
accurate, but Foundation-level work — a chart-of-accounts/bank-account milestone in its own
right — that would have widened 15I well past a settlement workflow. Deferred, not
rejected; the limitation is disclosed rather than silently assumed correct.

**On-account receipts touching only `current_balance`, no document allocation (Decision
2).** Simpler — no document lookup, no per-document amount validation — but the Sales/
Purchase Register would keep showing a paid invoice as unpaid, which is exactly the
`current_balance`/`amount_due` drift the 14B.5 audit warned a future payment path must not
introduce.

**Adding `payments.purchase_id` now to make supplier settlements traceable (Decision 2).**
Correct in isolation, but out of the approved scope ("no new table, column, view, index, or
policy"); recorded here as the natural follow-up if purchase-side payment traceability is
ever needed.

**Inventing a void/reversal workflow for payments now (Decision 4).** Rejected: no other
document in the application has one, and building it here — rather than for the ERP
generally — would produce an inconsistent, payment-specific precedent.

## Consequences

- `record_payment()` becomes the **second** authoritative writer of
  `invoices.amount_paid`/`amount_due` and `parties.current_balance` — never a duplicate
  calculation of them, and never routed around `create_sale()`'s own invoice-time write.
- A supplier payment recorded through `record_payment()` cannot be queried back to "which
  purchase did this `payments` row settle" from the `payments` table alone (no
  `purchase_id` column). `record_payment()`'s own JSON return value (`purchase_id`) and the
  `audit_log` row it writes are the only durable record of that link. A future milestone
  wanting purchase-side payment history would need to add that column.
- Every receipt/payment posts to `cashAccount` regardless of the recorded `payment_type` —
  an honest, disclosed limitation, not a silent misrepresentation of UPI/card/bank/wallet
  settlement as a distinct account.
- A recorded payment cannot be corrected, voided, or edited in this milestone. A mistaken
  settlement needs a compensating Manual Journal entry on the ledger side; the underlying
  `payments`/`amount_due`/`current_balance` figures stay as recorded until a future
  correction/reversal milestone exists.
- No existing posting provider, screen, or data module changes. Journal Register, General
  Ledger, Trial Balance, Profit & Loss, and Balance Sheet all render the new `receipt`/
  `payment` voucher entries with zero code change, since voucher type is an open string and
  every one of those screens already composes on `v_journal_ledger_lines`/`journal_entries`
  generically.
- The permanent prohibition on backfilling historical `payments` rows into new
  `ref_table = 'payments'` journal entries binds every future milestone, not just this one.

## References

- `accounting_rpc.sql` — `record_payment()`
- `js/services/accounting/providers/receiptPostingProvider.js`,
  `paymentPostingProvider.js` — the two new posting providers
- `js/customerOutstandingData.js` — the Milestone 14B.5 audit finding this ADR's Decision 1
  directly answers
- `docs/architecture/ADR/0009-journal-line-two-sided-amounts.md` — the two-sided line shape
  both new providers reuse unmodified
- `docs/architecture/ADR/0011-accounting-validation-throw-vs-result.md` — the throw-on-
  malformed-input convention `buildReceiptJournalEntry()`/`buildPaymentJournalEntry()` follow
