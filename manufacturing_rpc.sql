-- =====================================================================
-- ApnaBill manufacturing_rpc.sql (v4)
-- Run AFTER sale_rpc.sql
-- =====================================================================

create or replace function create_manufacturing(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  co uuid := (payload->>'company_id')::uuid;
  fm uuid := (payload->>'firm_id')::uuid;
  run_id uuid;
  run_no text;
  fy text;
  run_dt date := coalesce((payload->>'run_date')::date, current_date);
  produced_item uuid := (payload->>'produced_item_id')::uuid;
  produced_item_track_batches boolean;
  produced_batch_spec jsonb := payload->'produced_batch';
  produced_qty numeric(14,3) := coalesce((payload->>'produced_qty')::numeric, 0);
  overhead numeric(14,2) := coalesce((payload->>'overhead_cost')::numeric, 0);
  total_material numeric(14,2) := 0;
  total_cost numeric(14,2);
  cost_per_unit numeric(14,2);
  produced_batch uuid;
  cons jsonb;
  cur_stock numeric(14,3);
  cur_cost numeric(14,2);
  qty_use numeric(14,3);
  line_cost numeric(14,2);
  warnings jsonb := '[]'::jsonb;
  firm_co uuid;
begin
  if not is_member_of_company(co) then
    raise exception 'not a member of company %', co;
  end if;
  select company_id into firm_co from firms where id = fm;
  if firm_co is null or firm_co <> co then
    raise exception 'firm % does not belong to company %', fm, co;
  end if;
  if produced_qty <= 0 then raise exception 'produced_qty must be > 0'; end if;

  select track_batches into produced_item_track_batches
    from items where id = produced_item and company_id = co;
  if not found then
    raise exception 'produced item % not found in company %', produced_item, co;
  end if;

  select ni.invoice_no, ni.fy_label into run_no, fy
    from next_invoice_number(fm, 'mfg', run_dt) ni;

  insert into manufacturing_runs(
    company_id, firm_id, run_no, run_date, fy_label,
    produced_item_id, produced_qty, overhead_cost,
    total_material_cost, total_cost, cost_per_unit,
    notes, created_by
  ) values (
    co, fm, run_no, run_dt, fy,
    produced_item, produced_qty, overhead,
    0, 0, 0,
    payload->>'notes', auth.uid()
  ) returning id into run_id;

  for cons in select * from jsonb_array_elements(coalesce(payload->'consumed', '[]'::jsonb)) loop
    qty_use := coalesce((cons->>'qty')::numeric, 0);
    if qty_use <= 0 then continue; end if;

    cur_cost := coalesce((cons->>'unit_cost')::numeric, null);

    if nullif(cons->>'batch_id', '') is not null then
      select qty_on_hand, cost_price into cur_stock, cur_cost
        from batches where id = (cons->>'batch_id')::uuid for update;
      if cur_stock is null then cur_stock := 0; end if;
      if cur_stock < qty_use then
        warnings := warnings || jsonb_build_object(
          'code', 'negative_stock',
          'batch_id', cons->>'batch_id',
          'available', cur_stock, 'required', qty_use
        );
      end if;
      update batches set qty_on_hand = qty_on_hand - qty_use
        where id = (cons->>'batch_id')::uuid;
    else
      cur_cost := coalesce(cur_cost, 0);
      select coalesce(sum(qty_in - qty_out), 0) into cur_stock
        from stock_ledger where item_id = (cons->>'item_id')::uuid and company_id = co;
      if cur_stock < qty_use then
        warnings := warnings || jsonb_build_object(
          'code', 'negative_stock',
          'item_id', cons->>'item_id',
          'available', cur_stock, 'required', qty_use
        );
      end if;
    end if;

    line_cost := qty_use * coalesce(cur_cost, 0);
    total_material := total_material + line_cost;

    insert into manufacturing_lines(
      company_id, run_id, direction, item_id, batch_id, qty, unit_cost, line_cost
    ) values (
      co, run_id, 'consume',
      (cons->>'item_id')::uuid,
      nullif(cons->>'batch_id', '')::uuid,
      qty_use, coalesce(cur_cost, 0), line_cost
    );

    insert into stock_ledger(
      company_id, item_id, batch_id, txn_type,
      ref_table, ref_id, qty_out, unit_cost, notes
    ) values (
      co, (cons->>'item_id')::uuid, nullif(cons->>'batch_id', '')::uuid,
      'mfg_consume', 'manufacturing_runs', run_id,
      qty_use, coalesce(cur_cost, 0), 'mfg ' || run_no
    );
  end loop;

  total_cost := total_material + overhead;
  cost_per_unit := case when produced_qty > 0 then round(total_cost / produced_qty, 2) else 0 end;

  if produced_item_track_batches then
    insert into batches(company_id, item_id, batch_no, shade, size, mrp, cost_price, qty_on_hand)
      values (
        co, produced_item,
        coalesce(nullif(produced_batch_spec->>'batch_no', ''), run_no),
        produced_batch_spec->>'shade', produced_batch_spec->>'size',
        nullif(produced_batch_spec->>'mrp', '')::numeric,
        cost_per_unit, produced_qty
      )
      returning id into produced_batch;
  else
    produced_batch := null;
  end if;

  insert into manufacturing_lines(
    company_id, run_id, direction, item_id, batch_id, qty, unit_cost, line_cost
  ) values (
    co, run_id, 'produce', produced_item, produced_batch,
    produced_qty, cost_per_unit, total_cost
  );

  insert into stock_ledger(
    company_id, item_id, batch_id, txn_type,
    ref_table, ref_id, qty_in, unit_cost, notes
  ) values (
    co, produced_item, produced_batch, 'mfg_produce',
    'manufacturing_runs', run_id, produced_qty, cost_per_unit, 'mfg ' || run_no
  );

  update manufacturing_runs
    set total_material_cost = total_material,
        total_cost = total_cost,
        cost_per_unit = cost_per_unit,
        produced_batch_id = produced_batch
    where id = run_id;

  insert into audit_log(company_id, actor_user_id, action, table_name, row_id, after_json)
    values (co, auth.uid(), 'mfg.create', 'manufacturing_runs', run_id,
            jsonb_build_object('run_no', run_no, 'total_cost', total_cost,
                               'cost_per_unit', cost_per_unit, 'firm_id', fm));

  return jsonb_build_object(
    'run_id', run_id, 'run_no', run_no,
    'produced_batch_id', produced_batch,
    'total_material_cost', total_material,
    'total_cost', total_cost,
    'cost_per_unit', cost_per_unit,
    'warnings', warnings
  );
end;
$$;
