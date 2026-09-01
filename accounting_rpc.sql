-- =====================================================================
-- ApnaBill accounting_rpc.sql — Milestone 15B (Journal Engine), extended
-- by Milestone 15I (Payments & Receipts)
-- Run AFTER schema.sql (which must include the Milestone 15B accounting
-- tables: accounts, fiscal_periods, journal_entries, journal_lines,
-- accounting_settings, journal_number_counters).
--
-- Contents:
--   * next_journal_number(company_id, fy_label)  — atomic, unified
--     per-company-per-FY sequence (design decision #4). Same "lock the
--     counter row" idiom as sale_rpc.sql's next_invoice_number(), just
--     one row per (company, fy) instead of per (firm, doc_type, fy).
--   * post_journal_entry(payload jsonb)            — the only way a
--     journal entry is ever written. Idempotent on (company_id,
--     ref_table, ref_id): a retried post for the same source document
--     returns the entry that already exists instead of erroring or
--     duplicating (see the Milestone 15B design review's "Idempotency"
--     section). Asserts sum(debit) = sum(credit) before commit — exact
--     numeric equality, no epsilon, defense-in-depth behind the JS
--     integer-paise validator (design decision #2).
--   * record_payment(payload jsonb)                — Milestone 15I. The
--     atomic settlement RPC: records a payments row and, in the same
--     transaction, decrements the settled invoice's/purchase's
--     amount_paid/amount_due and adjusts the party's current_balance.
--     Writes NO journal entry — posting stays a separate best-effort
--     AccountingPlatform.post() call, exactly 15B's own two-step
--     contract. See ADR-0016.
--   * reverse_journal_entry(journal_id, reason)     — owner/manager only
--     (design decision #7). Idempotent on reversed_by_journal_id: a
--     retried reversal of an already-reversed entry returns the existing
--     reversal instead of creating a second one.
--
-- All writer functions check membership/ownership by hand, the same way
-- create_sale/create_purchase/create_manufacturing already do — RLS on
-- journal_entries/journal_lines/accounts is select-only for clients (see
-- schema.sql's "Accounting Platform RLS" section); these security-definer
-- functions are the only write path.
-- =====================================================================

-- ---------------------------------------------------------------------
-- next_journal_number — locks the counter row for atomic sequencing.
-- Format: JE/<fiscal year>/<6-digit zero-padded sequence>, e.g.
-- JE/2025-26/000001 -- the repository-agreed journal number format.
-- fy_label is supplied by the caller (post_journal_entry()/
-- reverse_journal_entry()), which reads it from the active
-- fiscal_periods row's own fiscal_year column -- never recomputed from
-- the system calendar here or anywhere else in the numbering path.
-- ---------------------------------------------------------------------
create or replace function next_journal_number(
  _company_id uuid,
  _fy_label text
) returns table(journal_no text)
language plpgsql security definer set search_path = public
as $$
declare
  cur_prefix text;
  cur_seq int;
  cur_pad int;
begin
  insert into journal_number_counters(company_id, fy_label, prefix, next_seq, pad_width)
  values (_company_id, _fy_label, 'JE/', 1, 6)
  on conflict (company_id, fy_label) do nothing;

  select jnc.prefix, jnc.next_seq, jnc.pad_width
    into cur_prefix, cur_seq, cur_pad
  from journal_number_counters jnc
  where jnc.company_id = _company_id and jnc.fy_label = _fy_label
  for update;

  update journal_number_counters set next_seq = cur_seq + 1
    where company_id = _company_id and fy_label = _fy_label;

  journal_no := cur_prefix || _fy_label || '/' || lpad(cur_seq::text, cur_pad, '0');
  return next;
end;
$$;

-- ---------------------------------------------------------------------
-- post_journal_entry
-- Payload shape (already balanced and validated in JS by
-- validateJournalEntry()/assertBalancedJournalEntry() before this RPC is
-- ever called — this function re-checks the balance itself, see header):
-- {
--   "company_id": uuid,
--   "entry_date": "YYYY-MM-DD",
--   "voucher_type": "sales" | "purchase" | "mfg" | "journal" | ...,
--   "posting_source": "sales" | "purchase" | "manufacturing" | "import" | ...,
--   "reference": str|null, "narration": str|null,
--   "ref_table": "invoices" | "purchases" | "manufacturing_runs" | null,
--   "ref_id": uuid|null,        -- the idempotency key together with ref_table
--   "created_by": uuid|null,    -- falls back to auth.uid()
--   "lines": [ { account_id, debit, credit, narration, metadata } ]
-- }
-- Returns: { journal_id, journal_no, was_duplicate }
-- ---------------------------------------------------------------------
create or replace function post_journal_entry(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  co uuid := (payload->>'company_id')::uuid;
  entry_dt date := coalesce((payload->>'entry_date')::date, current_date);
  v_voucher_type text := payload->>'voucher_type';
  v_posting_source text := payload->>'posting_source';
  v_reference text := nullif(payload->>'reference', '');
  v_narration text := nullif(payload->>'narration', '');
  v_ref_table text := nullif(payload->>'ref_table', '');
  v_ref_id uuid := nullif(payload->>'ref_id', '')::uuid;
  v_created_by uuid := coalesce(nullif(payload->>'created_by', '')::uuid, auth.uid());
  existing_id uuid;
  existing_no text;
  fp_id uuid;
  fp_status text;
  fp_fy text;
  je_id uuid := gen_random_uuid();
  je_no text;
  line jsonb;
  ln_no int := 0;
  v_debit numeric(14,2);
  v_credit numeric(14,2);
  sum_debit numeric(14,2) := 0;
  sum_credit numeric(14,2) := 0;
  line_count int := 0;
begin
  if co is null then raise exception 'company_id is required'; end if;
  if not is_member_of_company(co) then
    raise exception 'not a member of company %', co;
  end if;
  if coalesce(v_voucher_type, '') = '' or coalesce(v_posting_source, '') = '' then
    raise exception 'voucher_type and posting_source are required';
  end if;

  -- ---------- Idempotency fast path — see file header ----------
  if v_ref_id is not null then
    select id, journal_no into existing_id, existing_no
      from journal_entries
      where company_id = co and ref_table = v_ref_table and ref_id = v_ref_id;
    if existing_id is not null then
      return jsonb_build_object('journal_id', existing_id, 'journal_no', existing_no, 'was_duplicate', true);
    end if;
  end if;

  -- ---------- Fiscal period: fails closed, exactly like the in-memory
  -- fiscalPeriodService.canPostOn() ----------
  select id, status, fiscal_year into fp_id, fp_status, fp_fy
    from fiscal_periods
    where company_id = co and entry_dt between start_date and end_date
    for share;
  if fp_id is null then
    raise exception 'no fiscal period covers %', entry_dt;
  end if;
  if fp_status <> 'open' then
    raise exception 'fiscal period % is not open for posting (status=%)', fp_id, fp_status;
  end if;

  select journal_no into je_no from next_journal_number(co, fp_fy);

  begin
    insert into journal_entries(
      id, company_id, fiscal_period_id, journal_no, fy_label, entry_date,
      voucher_type, posting_source, reference, narration, ref_table, ref_id, created_by
    ) values (
      je_id, co, fp_id, je_no, fp_fy, entry_dt,
      v_voucher_type, v_posting_source, v_reference, v_narration, v_ref_table, v_ref_id, v_created_by
    );

    for line in select * from jsonb_array_elements(payload->'lines') loop
      ln_no := ln_no + 1;
      v_debit := coalesce((line->>'debit')::numeric(14,2), 0);
      v_credit := coalesce((line->>'credit')::numeric(14,2), 0);
      sum_debit := sum_debit + v_debit;
      sum_credit := sum_credit + v_credit;
      line_count := line_count + 1;

      insert into journal_lines(
        company_id, journal_entry_id, line_no, account_id, debit, credit, narration, metadata
      ) values (
        co, je_id, ln_no, (line->>'account_id')::uuid, v_debit, v_credit,
        nullif(line->>'narration', ''), coalesce(line->'metadata', '{}'::jsonb)
      );
    end loop;

    if line_count < 2 then
      raise exception 'a journal entry needs at least two lines, received %', line_count;
    end if;

    -- DB-side balance assertion (design decision #2). Postgres numeric is
    -- exact decimal arithmetic — this equality has none of the
    -- float-epsilon problem shared/money.js exists to solve in JS; it is
    -- cheap, genuine defense-in-depth behind the JS validator, not a
    -- restatement of it.
    if sum_debit <> sum_credit then
      raise exception 'journal entry is not balanced: debit % <> credit %', sum_debit, sum_credit;
    end if;

  exception when unique_violation then
    -- Lost the idempotency race: a concurrent call for the same source
    -- document committed first. Return its result — a retry must succeed,
    -- not fail. (See file header / design review "Idempotency".)
    select id, journal_no into existing_id, existing_no
      from journal_entries
      where company_id = co and ref_table = v_ref_table and ref_id = v_ref_id;
    if existing_id is not null then
      return jsonb_build_object('journal_id', existing_id, 'journal_no', existing_no, 'was_duplicate', true);
    end if;
    raise;
  end;

  insert into audit_log(company_id, actor_user_id, action, table_name, row_id, after_json)
    values (co, auth.uid(), 'journal.post', 'journal_entries', je_id,
            jsonb_build_object('journal_no', je_no, 'voucher_type', v_voucher_type,
                               'posting_source', v_posting_source, 'debit_total', sum_debit));

  return jsonb_build_object('journal_id', je_id, 'journal_no', je_no, 'was_duplicate', false);
end;
$$;

-- ---------------------------------------------------------------------
-- record_payment — Milestone 15I (Payments & Receipts)
--
-- The atomic settlement RPC: records one payments row and, in the SAME
-- transaction, decrements the settled document's amount_paid/amount_due
-- and adjusts the party's current_balance — the identical row-locked
-- update shape create_sale()/create_purchase() already use, so this
-- becomes the SECOND authoritative writer of those columns, never a
-- duplicate calculation of them (see ADR-0016).
--
-- Writes NO journal entry. Posting stays exclusively with
-- post_journal_entry(), called as a separate best-effort second step by
-- the client through AccountingPlatform.post() — the same two-step
-- contract 15B established for Sales/Purchase/Manufacturing.
--
-- Payload shape:
-- {
--   "company_id": uuid,
--   "direction": "receipt" | "payment",
--   "party_id": uuid,                    -- required; the customer (receipt) or supplier (payment)
--   "invoice_id": uuid | null,            -- required for a receipt, ignored for a payment
--   "purchase_id": uuid | null,           -- required for a payment, ignored for a receipt
--   "amount": number,                     -- > 0, must not exceed the document's own amount_due
--   "payment_date": "YYYY-MM-DD",
--   "payment_type_id": uuid | null,
--   "reference": text | null,
--   "notes": text | null
-- }
-- Returns: { payment_id, direction, invoice_id, purchase_id, party_id, amount, firm_id }
--
-- Document-level allocation only (design decision, ADR-0016): one
-- record_payment() call settles exactly one document. There is no
-- allocations table — payments.invoice_id is the sales-side allocation,
-- exactly as it already was at invoice-time in create_sale(). On the
-- purchase side, payments has no purchase_id column (it never did — see
-- create_purchase()'s own existing insert, which already passes
-- invoice_id = null for a purchase payment); this function updates the
-- named purchases row directly from the _purchase_id argument instead of
-- persisting the link on the payments row, the same non-traceable shape
-- create_purchase()'s own payment insert already has today. That is a
-- disclosed limitation (see the 15I production readiness report), not a
-- regression this function introduces.
-- ---------------------------------------------------------------------
create or replace function record_payment(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  co uuid := (payload->>'company_id')::uuid;
  v_direction text := payload->>'direction';
  party uuid := nullif(payload->>'party_id', '')::uuid;
  inv_id uuid := nullif(payload->>'invoice_id', '')::uuid;
  pur_id uuid := nullif(payload->>'purchase_id', '')::uuid;
  amt numeric(14,2) := (payload->>'amount')::numeric;
  pay_date date := coalesce((payload->>'payment_date')::date, current_date);
  ptype uuid := nullif(payload->>'payment_type_id', '')::uuid;
  v_reference text := nullif(payload->>'reference', '');
  v_notes text := nullif(payload->>'notes', '');
  pay_id uuid;
  doc_co uuid;
  doc_party uuid;
  doc_due numeric(14,2);
  doc_firm uuid;
  cur_bal numeric(14,2);
begin
  if co is null then raise exception 'company_id is required'; end if;
  if not is_member_of_company(co) then
    raise exception 'not a member of company %', co;
  end if;
  if v_direction not in ('receipt', 'payment') then
    raise exception 'direction must be "receipt" or "payment", received %', v_direction;
  end if;
  if party is null then
    raise exception 'party_id is required';
  end if;
  if amt is null or amt <= 0 then
    raise exception 'amount must be a positive number, received %', payload->>'amount';
  end if;

  if v_direction = 'receipt' then
    if inv_id is null then
      raise exception 'invoice_id is required for a receipt';
    end if;

    select company_id, party_id, amount_due, firm_id into doc_co, doc_party, doc_due, doc_firm
      from invoices where id = inv_id for update;
    if doc_co is null then raise exception 'invoice % not found', inv_id; end if;
    if doc_co <> co then raise exception 'invoice % does not belong to company %', inv_id, co; end if;
    if doc_party is distinct from party then
      raise exception 'invoice % does not belong to party %', inv_id, party;
    end if;
    if amt > doc_due then
      raise exception 'amount % exceeds outstanding amount % for invoice %', amt, doc_due, inv_id;
    end if;

    insert into payments(
      company_id, firm_id, invoice_id, party_id, payment_date,
      payment_type_id, amount, reference, notes, created_by
    ) values (
      co, doc_firm, inv_id, party, pay_date,
      ptype, amt, v_reference, v_notes, auth.uid()
    ) returning id into pay_id;

    update invoices set
      amount_paid = amount_paid + amt,
      amount_due = amount_due - amt,
      is_credit = (amount_due - amt) > 0
    where id = inv_id;

    select current_balance into cur_bal from parties where id = party for update;
    update parties set current_balance = coalesce(cur_bal, 0) - amt where id = party;

  else -- 'payment'
    if pur_id is null then
      raise exception 'purchase_id is required for a payment';
    end if;

    select company_id, supplier_id, amount_due, firm_id into doc_co, doc_party, doc_due, doc_firm
      from purchases where id = pur_id for update;
    if doc_co is null then raise exception 'purchase % not found', pur_id; end if;
    if doc_co <> co then raise exception 'purchase % does not belong to company %', pur_id, co; end if;
    if doc_party is distinct from party then
      raise exception 'purchase % does not belong to party %', pur_id, party;
    end if;
    if amt > doc_due then
      raise exception 'amount % exceeds outstanding amount % for purchase %', amt, doc_due, pur_id;
    end if;

    insert into payments(
      company_id, firm_id, invoice_id, party_id, payment_date,
      payment_type_id, amount, reference, notes, created_by
    ) values (
      co, doc_firm, null, party, pay_date,
      ptype, amt, v_reference, coalesce(v_notes, 'purchase payment'), auth.uid()
    ) returning id into pay_id;

    update purchases set
      amount_paid = amount_paid + amt,
      amount_due = amount_due - amt
    where id = pur_id;

    select current_balance into cur_bal from parties where id = party for update;
    update parties set current_balance = coalesce(cur_bal, 0) + amt where id = party;
  end if;

  insert into audit_log(company_id, actor_user_id, action, table_name, row_id, after_json)
    values (co, auth.uid(), v_direction || '.record', 'payments', pay_id,
            jsonb_build_object('amount', amt, 'invoice_id', inv_id, 'purchase_id', pur_id, 'party_id', party));

  return jsonb_build_object(
    'payment_id', pay_id, 'direction', v_direction,
    'invoice_id', inv_id, 'purchase_id', pur_id, 'party_id', party,
    'amount', amt, 'firm_id', doc_firm
  );
end;
$$;

-- ---------------------------------------------------------------------
-- reverse_journal_entry
-- Owner/manager only (design decision #7) — no roles/permissions model
-- exists elsewhere in this application, so this reuses the same
-- is_owner_of_company() check firms/company updates already use, rather
-- than building a new one.
-- Returns: { journal_id, reverses_journal_id, journal_no, was_duplicate }
-- ---------------------------------------------------------------------
create or replace function reverse_journal_entry(
  _journal_id uuid,
  _reason text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  orig record;
  rev_id uuid := gen_random_uuid();
  rev_no text;
  fp_id uuid;
  fp_status text;
  fp_fy text;
  rev_dt date := current_date;
  line record;
  ln_no int := 0;
begin
  select * into orig from journal_entries where id = _journal_id for update;
  if orig.id is null then
    raise exception 'journal entry % not found', _journal_id;
  end if;
  if not is_owner_of_company(orig.company_id) then
    raise exception 'only an owner/manager of company % may reverse a journal entry', orig.company_id;
  end if;

  -- Idempotency: reversing an already-reversed entry returns the existing
  -- reversal instead of creating a second one or erroring — the row lock
  -- above makes this race-safe against a concurrent second reversal call.
  if orig.reversed_by_journal_id is not null then
    return jsonb_build_object(
      'journal_id', orig.reversed_by_journal_id,
      'reverses_journal_id', orig.id,
      'journal_no', (select journal_no from journal_entries where id = orig.reversed_by_journal_id),
      'was_duplicate', true
    );
  end if;

  if exists (select 1 from fiscal_periods where id = orig.fiscal_period_id and status = 'locked') then
    raise exception 'journal entry % belongs to a locked fiscal period and cannot be reversed', _journal_id;
  end if;

  -- The reversal posts into whichever period is open on today's date, not
  -- the original entry's period — a CLOSED original period is reversible
  -- by design (the ordinary month-end close an accountant routinely
  -- reverses to post a late entry); only LOCKED (checked above) blocks it.
  select id, status, fiscal_year into fp_id, fp_status, fp_fy
    from fiscal_periods
    where company_id = orig.company_id and rev_dt between start_date and end_date
    for share;
  if fp_id is null then
    raise exception 'no fiscal period covers %', rev_dt;
  end if;
  if fp_status <> 'open' then
    raise exception 'fiscal period % is not open for posting (status=%)', fp_id, fp_status;
  end if;

  select journal_no into rev_no from next_journal_number(orig.company_id, fp_fy);

  insert into journal_entries(
    id, company_id, fiscal_period_id, journal_no, fy_label, entry_date,
    voucher_type, posting_source, reference, narration, reverses_journal_id, created_by
  ) values (
    rev_id, orig.company_id, fp_id, rev_no, fp_fy, rev_dt,
    orig.voucher_type, 'reversal', orig.reference,
    coalesce(_reason, 'Reversal of ' || orig.journal_no), orig.id, auth.uid()
  );

  -- Mirror image of the original: debit/credit swapped per line, same
  -- accounts. A balanced entry's mirror is trivially balanced, so no
  -- re-validation of amounts is needed here, only of period postability.
  for line in select * from journal_lines where journal_entry_id = orig.id order by line_no loop
    ln_no := ln_no + 1;
    insert into journal_lines(company_id, journal_entry_id, line_no, account_id, debit, credit, narration, metadata)
      values (orig.company_id, rev_id, ln_no, line.account_id, line.credit, line.debit, line.narration, line.metadata);
  end loop;

  update journal_entries set reversed_by_journal_id = rev_id where id = orig.id;

  insert into audit_log(company_id, actor_user_id, action, table_name, row_id, after_json)
    values (orig.company_id, auth.uid(), 'journal.reverse', 'journal_entries', rev_id,
            jsonb_build_object('journal_no', rev_no, 'reverses_journal_id', orig.id, 'reason', _reason));

  return jsonb_build_object('journal_id', rev_id, 'reverses_journal_id', orig.id, 'journal_no', rev_no, 'was_duplicate', false);
end;
$$;

-- Done.
