-- =====================================================================
-- ApnaBill stock_rpc.sql
-- Run AFTER schema.sql
-- Contents:
--   * record_stock_adjustment(payload jsonb) — atomic manual stock correction
-- Soft negative stock: allow, return went_negative flag (same philosophy
-- as create_sale / create_purchase's warnings[]).
-- =====================================================================

-- ---------------------------------------------------------------------
-- record_stock_adjustment
-- Payload shape:
-- {
--   "company_id": uuid,
--   "item_id": uuid,
--   "batch_id": uuid | null,        -- required if item.track_batches
--   "adjustment_qty": number,        -- signed, non-zero
--   "reason": text,                  -- required, e.g. "Damage"
--   "notes": text | null
-- }
-- Returns: { ledger_id, new_qty_on_hand, went_negative }
-- ---------------------------------------------------------------------
create or replace function record_stock_adjustment(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  co uuid := (payload->>'company_id')::uuid;
  it_id uuid := (payload->>'item_id')::uuid;
  b_id uuid := nullif(payload->>'batch_id', '')::uuid;
  adj numeric(14,3) := coalesce((payload->>'adjustment_qty')::numeric, 0);
  reason text := nullif(trim(payload->>'reason'), '');
  notes text := nullif(trim(payload->>'notes'), '');
  full_notes text;
  item_track_batches boolean;
  cur_qty numeric(14,3);
  new_qty numeric(14,3);
  ledger_id uuid;
begin
  if not is_member_of_company(co) then
    raise exception 'not a member of company %', co;
  end if;
  if adj = 0 then
    raise exception 'adjustment quantity must not be zero';
  end if;
  if reason is null then
    raise exception 'reason is required';
  end if;

  select track_batches into item_track_batches
    from items where id = it_id and company_id = co;
  if not found then
    raise exception 'item % not found in company %', it_id, co;
  end if;

  full_notes := reason || case when notes is not null then ' — ' || notes else '' end;

  if item_track_batches then
    if b_id is null then
      raise exception 'batch_id is required for a batch-tracked item';
    end if;
    select qty_on_hand into cur_qty
      from batches where id = b_id and item_id = it_id and company_id = co
      for update;
    if not found then
      raise exception 'batch % not found for item %', b_id, it_id;
    end if;
    new_qty := cur_qty + adj;
    update batches set qty_on_hand = new_qty where id = b_id;
  else
    b_id := null;
    select coalesce(sum(qty_in - qty_out), 0) into cur_qty
      from stock_ledger where item_id = it_id and company_id = co;
    new_qty := cur_qty + adj;
  end if;

  insert into stock_ledger(
    company_id, item_id, batch_id, txn_type,
    ref_table, ref_id, qty_in, qty_out, unit_cost, notes
  ) values (
    co, it_id, b_id, 'adjustment',
    null, null,
    greatest(adj, 0), greatest(-adj, 0),
    null, full_notes
  ) returning id into ledger_id;

  insert into audit_log(company_id, actor_user_id, action, table_name, row_id, after_json)
    values (co, auth.uid(), 'stock.adjustment', 'stock_ledger', ledger_id,
            jsonb_build_object(
              'item_id', it_id, 'batch_id', b_id,
              'adjustment_qty', adj, 'new_qty', new_qty, 'reason', reason
            ));

  return jsonb_build_object(
    'ledger_id', ledger_id,
    'new_qty_on_hand', new_qty,
    'went_negative', new_qty < 0
  );
end;
$$;
