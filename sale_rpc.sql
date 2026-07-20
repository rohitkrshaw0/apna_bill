-- =====================================================================
-- ApnaBill sale_rpc.sql (v4)
-- Run AFTER schema.sql
-- Contents:
--   * next_invoice_number(firm_id, doc_type, date)  — atomic FY seq per firm
--   * create_sale(payload jsonb)                     — atomic sale
--   * create_purchase(payload jsonb)                 — atomic purchase + batches
-- Soft negative stock: allow, return warnings[] in JSON.
-- =====================================================================

-- ---------------------------------------------------------------------
-- next_invoice_number — locks the prefix row for atomic sequencing
-- ---------------------------------------------------------------------
create or replace function next_invoice_number(
  _firm_id uuid,
  _doc_type text,
  _date date default current_date
) returns table(invoice_no text, fy_label text)
language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
-- This function's own RETURNS TABLE gives it two implicit variables,
-- invoice_no and fy_label, that collide by name with real columns on
-- invoice_prefixes (invoice_prefixes.fy_label — invoice_no isn't a column
-- there, but fy_label is, and that's enough to make every bare reference
-- to it below ambiguous under Postgres's default plpgsql.variable_conflict
-- = error). The ON CONFLICT target list a few lines down can't be
-- qualified with a table alias the way a WHERE clause can — this pragma
-- is the correct fix for that case: prefer the column over the variable
-- everywhere in this function. Safe here because fy_label is never read
-- as a variable before its one assignment at the very end, and a plain
-- `:=` assignment target isn't subject to variable_conflict at all.
declare
  _company_id uuid;
  fy text;
  fy_start int;
  row_id uuid;
  cur_prefix text;
  cur_seq int;
  cur_pad int;
begin
  select f.company_id into _company_id from firms f where f.id = _firm_id;
  if _company_id is null then raise exception 'firm not found: %', _firm_id; end if;
  if not is_member_of_company(_company_id) then
    raise exception 'not a member of company %', _company_id;
  end if;

  select c.fy_start_month into fy_start from companies c where c.id = _company_id;
  fy := current_fy(_date, coalesce(fy_start, 4));

  insert into invoice_prefixes(company_id, firm_id, doc_type, fy_label, prefix, next_seq, pad_width)
  values (_company_id, _firm_id, _doc_type, fy, '', 1, 4)
  on conflict (firm_id, doc_type, fy_label) do nothing;

  -- Table-qualified (ip.*): this function's own RETURNS TABLE column is also
  -- named fy_label, so an unqualified `fy_label = fy` here is genuinely
  -- ambiguous between that variable and invoice_prefixes.fy_label — Postgres's
  -- default plpgsql.variable_conflict = error rejects it at runtime.
  select ip.id, ip.prefix, ip.next_seq, ip.pad_width
    into row_id, cur_prefix, cur_seq, cur_pad
  from invoice_prefixes ip
  where ip.firm_id = _firm_id and ip.doc_type = _doc_type and ip.fy_label = fy
  for update;

  update invoice_prefixes set next_seq = cur_seq + 1 where id = row_id;

  invoice_no := cur_prefix || lpad(cur_seq::text, cur_pad, '0');
  fy_label := fy;
  return next;
end;
$$;


-- ---------------------------------------------------------------------
-- create_sale
-- Payload shape:
-- {
--   "company_id": uuid, "firm_id": uuid,
--   "invoice_date": "YYYY-MM-DD",
--   "is_interstate": bool,
--   "party_id": uuid|null, "party_snapshot": {...} | null,
--   "notes": str,
--   "loyalty_redeem_points": int, "loyalty_discount": number,
--   "round_off": number,
--   "totals": { subtotal, discount_total, cgst_total, sgst_total,
--               igst_total, cess_total, grand_total },
--   "lines": [ { item_id, batch_id, item_name, hsn_sac, unit,
--                qty_paid, qty_free, rate, is_inclusive,
--                discount_pct, discount_amt, taxable_value,
--                gst_rate, cgst_amt, sgst_amt, igst_amt,
--                cess_rate, cess_amt, line_total } ],
--   "payment": { payment_type_id, amount, discount, reference, notes } | null
--     -- amount is the amount received now; 0/null => pure credit sale.
--     -- is_credit and amount_due are derived server-side from amount vs grand_total.
-- }
-- Returns: { invoice_id, invoice_no, fy_label, warnings }
-- ---------------------------------------------------------------------
create or replace function create_sale(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  co uuid := (payload->>'company_id')::uuid;
  fm uuid := (payload->>'firm_id')::uuid;
  inv_id uuid;
  inv_no text;
  fy text;
  line jsonb;
  ln_no int := 0;
  warnings jsonb := '[]'::jsonb;
  cur_stock numeric(14,3);
  deduct_qty numeric(14,3);
  net_taxable numeric(14,2) := 0;
  earn_points int := 0;
  redeem_points int := coalesce((payload->>'loyalty_redeem_points')::int, 0);
  loyalty_disc numeric(14,2) := coalesce((payload->>'loyalty_discount')::numeric, 0);
  party uuid;
  party_snap jsonb := payload->'party_snapshot';
  totals jsonb := payload->'totals';
  amt_grand numeric(14,2) := coalesce((totals->>'grand_total')::numeric, 0);
  amt_paid numeric(14,2) := 0;
  cur_bal numeric(14,2);
  cur_points int;
  loyalty_cfg record;
  pay jsonb := payload->'payment';
  batch_cost numeric(14,2);
  firm_co uuid;
begin
  if not is_member_of_company(co) then
    raise exception 'not a member of company %', co;
  end if;
  select company_id into firm_co from firms where id = fm;
  if firm_co is null or firm_co <> co then
    raise exception 'firm % does not belong to company %', fm, co;
  end if;

  -- Apply loyalty discount to grand_total (already netted client-side, but we
  -- also net here defensively so downstream figures are consistent)
  amt_grand := greatest(0, amt_grand - loyalty_disc);

  -- Next invoice number
  select ni.invoice_no, ni.fy_label into inv_no, fy
    from next_invoice_number(fm, 'sale', coalesce((payload->>'invoice_date')::date, current_date)) ni;

  party := nullif(payload->>'party_id', '')::uuid;

  -- Header
  insert into invoices(
    company_id, firm_id, invoice_no, fy_label, doc_type, invoice_date,
    party_id, party_name_snapshot, party_phone_snapshot,
    party_gstin_snapshot, party_state_code_snapshot,
    is_interstate,
    subtotal, discount_total, cgst_total, sgst_total, igst_total, cess_total,
    round_off, grand_total, amount_paid, amount_due,
    loyalty_earned, loyalty_redeemed, loyalty_discount,
    notes, created_by
  ) values (
    co, fm, inv_no, fy, 'sale', coalesce((payload->>'invoice_date')::date, current_date),
    party,
    coalesce(party_snap->>'name', ''),
    party_snap->>'phone', party_snap->>'gstin', party_snap->>'state_code',
    coalesce((payload->>'is_interstate')::boolean, false),
    coalesce((totals->>'subtotal')::numeric, 0),
    coalesce((totals->>'discount_total')::numeric, 0),
    coalesce((totals->>'cgst_total')::numeric, 0),
    coalesce((totals->>'sgst_total')::numeric, 0),
    coalesce((totals->>'igst_total')::numeric, 0),
    coalesce((totals->>'cess_total')::numeric, 0),
    coalesce((payload->>'round_off')::numeric, 0),
    amt_grand, 0, amt_grand,
    0, redeem_points, loyalty_disc,
    payload->>'notes', auth.uid()
  ) returning id into inv_id;

  -- Lines + stock deduction (soft negative)
  for line in select * from jsonb_array_elements(payload->'lines') loop
    ln_no := ln_no + 1;
    deduct_qty := coalesce((line->>'qty_paid')::numeric, 0)
                + coalesce((line->>'qty_free')::numeric, 0);

    insert into invoice_lines(
      company_id, invoice_id, line_no,
      item_id, batch_id, item_name_snapshot,
      hsn_sac, unit, qty_paid, qty_free,
      rate, is_inclusive, discount_pct, discount_amt,
      taxable_value, gst_rate,
      cgst_amt, sgst_amt, igst_amt, cess_rate, cess_amt, line_total
    ) values (
      co, inv_id, ln_no,
      nullif(line->>'item_id', '')::uuid,
      nullif(line->>'batch_id', '')::uuid,
      coalesce(line->>'item_name', ''),
      line->>'hsn_sac', line->>'unit',
      coalesce((line->>'qty_paid')::numeric, 0),
      coalesce((line->>'qty_free')::numeric, 0),
      coalesce((line->>'rate')::numeric, 0),
      coalesce((line->>'is_inclusive')::boolean, false),
      coalesce((line->>'discount_pct')::numeric, 0),
      coalesce((line->>'discount_amt')::numeric, 0),
      coalesce((line->>'taxable_value')::numeric, 0),
      coalesce((line->>'gst_rate')::numeric, 0),
      coalesce((line->>'cgst_amt')::numeric, 0),
      coalesce((line->>'sgst_amt')::numeric, 0),
      coalesce((line->>'igst_amt')::numeric, 0),
      coalesce((line->>'cess_rate')::numeric, 0),
      coalesce((line->>'cess_amt')::numeric, 0),
      coalesce((line->>'line_total')::numeric, 0)
    );

    net_taxable := net_taxable + coalesce((line->>'taxable_value')::numeric, 0);

    if (line ? 'item_id') and nullif(line->>'item_id', '') is not null then
      if (select track_stock from items where id = (line->>'item_id')::uuid) then
        if nullif(line->>'batch_id', '') is not null then
          select qty_on_hand, cost_price into cur_stock, batch_cost
            from batches where id = (line->>'batch_id')::uuid for update;
          if cur_stock is null then cur_stock := 0; end if;
          if cur_stock < deduct_qty then
            warnings := warnings || jsonb_build_object(
              'code', 'negative_stock',
              'item_name', line->>'item_name',
              'batch_id', line->>'batch_id',
              'available', cur_stock, 'required', deduct_qty
            );
          end if;
          update batches set qty_on_hand = qty_on_hand - deduct_qty
            where id = (line->>'batch_id')::uuid;
          insert into stock_ledger(
            company_id, item_id, batch_id, txn_type,
            ref_table, ref_id, qty_out, unit_cost, notes
          ) values (
            co, (line->>'item_id')::uuid, (line->>'batch_id')::uuid, 'sale',
            'invoices', inv_id, deduct_qty, batch_cost, 'sale ' || inv_no
          );
        else
          select coalesce(sum(qty_in - qty_out), 0) into cur_stock
            from stock_ledger where item_id = (line->>'item_id')::uuid;
          if cur_stock < deduct_qty then
            warnings := warnings || jsonb_build_object(
              'code', 'negative_stock',
              'item_name', line->>'item_name',
              'available', cur_stock, 'required', deduct_qty
            );
          end if;
          insert into stock_ledger(
            company_id, item_id, batch_id, txn_type,
            ref_table, ref_id, qty_out, notes
          ) values (
            co, (line->>'item_id')::uuid, null, 'sale',
            'invoices', inv_id, deduct_qty, 'sale ' || inv_no
          );
        end if;
      end if;
    end if;
  end loop;

  -- Loyalty earn / redeem (points travel with the customer at company level)
  if party is not null then
    select loyalty_enabled, loyalty_earn_per_100, loyalty_redeem_value, loyalty_min_redeem_points
      into loyalty_cfg from companies where id = co;

    if loyalty_cfg.loyalty_enabled then
      earn_points := floor(net_taxable * loyalty_cfg.loyalty_earn_per_100 / 100.0)::int;
    end if;

    select loyalty_points into cur_points from parties where id = party for update;
    if cur_points is null then cur_points := 0; end if;

    if redeem_points > cur_points then
      raise exception 'redeem points % exceed available balance %', redeem_points, cur_points;
    end if;

    if earn_points > 0 then
      insert into loyalty_transactions(company_id, party_id, invoice_id, direction, points, balance_after)
        values (co, party, inv_id, 'earn', earn_points, cur_points - redeem_points + earn_points);
    end if;
    if redeem_points > 0 then
      insert into loyalty_transactions(company_id, party_id, invoice_id, direction, points, balance_after)
        values (co, party, inv_id, 'redeem', redeem_points, cur_points - redeem_points);
    end if;

    update parties set loyalty_points = cur_points - redeem_points + earn_points where id = party;
    update invoices set loyalty_earned = earn_points where id = inv_id;
  end if;

  -- Payment: amount received now (0 => pure credit, partial allowed, client-driven)
  if pay is not null and coalesce((pay->>'amount')::numeric, 0) > 0 then
    amt_paid := least(coalesce((pay->>'amount')::numeric, 0), amt_grand);
    insert into payments(
      company_id, firm_id, invoice_id, party_id, payment_date,
      payment_type_id, amount, discount, reference, notes, created_by
    ) values (
      co, fm, inv_id, party, coalesce((payload->>'invoice_date')::date, current_date),
      nullif(pay->>'payment_type_id', '')::uuid,
      amt_paid, coalesce((pay->>'discount')::numeric, 0),
      pay->>'reference', pay->>'notes', auth.uid()
    );
  end if;

  update invoices set
    amount_paid = amt_paid,
    amount_due = amt_grand - amt_paid,
    is_credit = (amt_grand - amt_paid) > 0
  where id = inv_id;

  if party is not null and (amt_grand - amt_paid) <> 0 then
    select current_balance into cur_bal from parties where id = party for update;
    update parties set current_balance = coalesce(cur_bal, 0) + (amt_grand - amt_paid) where id = party;
  end if;

  insert into audit_log(company_id, actor_user_id, action, table_name, row_id, after_json)
    values (co, auth.uid(), 'sale.create', 'invoices', inv_id,
            jsonb_build_object('invoice_no', inv_no, 'grand_total', amt_grand, 'firm_id', fm));

  return jsonb_build_object(
    'invoice_id', inv_id, 'invoice_no', inv_no, 'fy_label', fy, 'warnings', warnings
  );
end;
$$;


-- ---------------------------------------------------------------------
-- create_purchase — mirror; creates batches for stock in
-- ---------------------------------------------------------------------
create or replace function create_purchase(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  co uuid := (payload->>'company_id')::uuid;
  fm uuid := (payload->>'firm_id')::uuid;
  pur_id uuid;
  bill_no text := coalesce(payload->>'bill_no', '');
  bill_dt date := coalesce((payload->>'bill_date')::date, current_date);
  fy text;
  fy_start int;
  line jsonb;
  ln_no int := 0;
  supp uuid := nullif(payload->>'supplier_id', '')::uuid;
  supp_snap jsonb := payload->'supplier_snapshot';
  totals jsonb := payload->'totals';
  amt_grand numeric(14,2) := coalesce((totals->>'grand_total')::numeric, 0);
  amt_paid numeric(14,2) := 0;
  cur_bal numeric(14,2);
  new_batch uuid;
  batch_ids uuid[] := array[]::uuid[];
  landed numeric(14,2);
  pay jsonb := payload->'payment';
  firm_co uuid;
  item_track_stock boolean;
  item_track_batches boolean;
begin
  if not is_member_of_company(co) then
    raise exception 'not a member of company %', co;
  end if;
  select company_id into firm_co from firms where id = fm;
  if firm_co is null or firm_co <> co then
    raise exception 'firm % does not belong to company %', fm, co;
  end if;

  select fy_start_month into fy_start from companies where id = co;
  fy := current_fy(bill_dt, coalesce(fy_start, 4));

  insert into purchases(
    company_id, firm_id, bill_no, bill_date, fy_label,
    supplier_id, supplier_gstin_snapshot, supplier_state_code_snapshot,
    is_interstate,
    subtotal, discount_total, cgst_total, sgst_total, igst_total, cess_total,
    round_off, grand_total, amount_paid, amount_due,
    notes, created_by
  ) values (
    co, fm, bill_no, bill_dt, fy,
    supp, supp_snap->>'gstin', supp_snap->>'state_code',
    coalesce((payload->>'is_interstate')::boolean, false),
    coalesce((totals->>'subtotal')::numeric, 0),
    coalesce((totals->>'discount_total')::numeric, 0),
    coalesce((totals->>'cgst_total')::numeric, 0),
    coalesce((totals->>'sgst_total')::numeric, 0),
    coalesce((totals->>'igst_total')::numeric, 0),
    coalesce((totals->>'cess_total')::numeric, 0),
    coalesce((payload->>'round_off')::numeric, 0),
    amt_grand, 0, amt_grand,
    payload->>'notes', auth.uid()
  ) returning id into pur_id;

  for line in select * from jsonb_array_elements(payload->'lines') loop
    ln_no := ln_no + 1;
    landed := coalesce((line->>'landed_cost_per_unit')::numeric, (line->>'rate')::numeric, 0);

    new_batch := null;
    if (line ? 'item_id') and nullif(line->>'item_id', '') is not null then
      select track_stock, track_batches into item_track_stock, item_track_batches
        from items where id = (line->>'item_id')::uuid;

      if item_track_stock then
        if item_track_batches then
          insert into batches(
            company_id, item_id, batch_no, shade, size, mrp,
            cost_price, qty_on_hand, purchase_id
          ) values (
            co, (line->>'item_id')::uuid,
            line->>'batch_no', line->>'shade', line->>'size',
            nullif(line->>'mrp', '')::numeric,
            landed,
            coalesce((line->>'qty')::numeric, 0) + coalesce((line->>'qty_free')::numeric, 0),
            pur_id
          ) returning id into new_batch;

          batch_ids := batch_ids || new_batch;

          insert into stock_ledger(
            company_id, item_id, batch_id, txn_type,
            ref_table, ref_id, qty_in, unit_cost, notes
          ) values (
            co, (line->>'item_id')::uuid, new_batch, 'purchase',
            'purchases', pur_id,
            coalesce((line->>'qty')::numeric, 0) + coalesce((line->>'qty_free')::numeric, 0),
            landed, 'purchase ' || bill_no
          );
        else
          insert into stock_ledger(
            company_id, item_id, batch_id, txn_type,
            ref_table, ref_id, qty_in, unit_cost, notes
          ) values (
            co, (line->>'item_id')::uuid, null, 'purchase',
            'purchases', pur_id,
            coalesce((line->>'qty')::numeric, 0) + coalesce((line->>'qty_free')::numeric, 0),
            landed, 'purchase ' || bill_no
          );
        end if;
      end if;
    end if;

    insert into purchase_lines(
      company_id, purchase_id, line_no,
      item_id, item_name_snapshot, hsn_sac, unit,
      qty, qty_free, rate, is_inclusive,
      discount_pct, discount_amt, taxable_value,
      gst_rate, cgst_amt, sgst_amt, igst_amt,
      cess_rate, cess_amt, line_total,
      batch_no, shade, size, mrp, batch_id
    ) values (
      co, pur_id, ln_no,
      nullif(line->>'item_id', '')::uuid,
      coalesce(line->>'item_name', ''),
      line->>'hsn_sac', line->>'unit',
      coalesce((line->>'qty')::numeric, 0),
      coalesce((line->>'qty_free')::numeric, 0),
      coalesce((line->>'rate')::numeric, 0),
      coalesce((line->>'is_inclusive')::boolean, false),
      coalesce((line->>'discount_pct')::numeric, 0),
      coalesce((line->>'discount_amt')::numeric, 0),
      coalesce((line->>'taxable_value')::numeric, 0),
      coalesce((line->>'gst_rate')::numeric, 0),
      coalesce((line->>'cgst_amt')::numeric, 0),
      coalesce((line->>'sgst_amt')::numeric, 0),
      coalesce((line->>'igst_amt')::numeric, 0),
      coalesce((line->>'cess_rate')::numeric, 0),
      coalesce((line->>'cess_amt')::numeric, 0),
      coalesce((line->>'line_total')::numeric, 0),
      line->>'batch_no', line->>'shade', line->>'size',
      nullif(line->>'mrp', '')::numeric, new_batch
    );
  end loop;

  if pay is not null and coalesce((pay->>'amount')::numeric, 0) > 0 then
    amt_paid := least(coalesce((pay->>'amount')::numeric, 0), amt_grand);
    insert into payments(
      company_id, firm_id, invoice_id, party_id, payment_date,
      payment_type_id, amount, discount, reference, notes, created_by
    ) values (
      co, fm, null, supp, bill_dt,
      nullif(pay->>'payment_type_id', '')::uuid,
      amt_paid, coalesce((pay->>'discount')::numeric, 0),
      pay->>'reference', coalesce(pay->>'notes', 'purchase payment'), auth.uid()
    );
  end if;

  update purchases set amount_paid = amt_paid, amount_due = amt_grand - amt_paid where id = pur_id;

  if supp is not null and (amt_grand - amt_paid) <> 0 then
    select current_balance into cur_bal from parties where id = supp for update;
    update parties set current_balance = coalesce(cur_bal, 0) - (amt_grand - amt_paid) where id = supp;
  end if;

  insert into audit_log(company_id, actor_user_id, action, table_name, row_id, after_json)
    values (co, auth.uid(), 'purchase.create', 'purchases', pur_id,
            jsonb_build_object('bill_no', bill_no, 'grand_total', amt_grand, 'firm_id', fm));

  return jsonb_build_object(
    'purchase_id', pur_id, 'bill_no', bill_no, 'fy_label', fy,
    'batch_ids', to_jsonb(batch_ids), 'warnings', '[]'::jsonb
  );
end;
$$;
