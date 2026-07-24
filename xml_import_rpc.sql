-- =====================================================================
-- ApnaBill xml_import_rpc.sql (Milestone 9B)
-- Run AFTER schema.sql (does not modify or depend on stock_rpc.sql /
-- sale_rpc.sql -- purely additive).
-- Contents:
--   * record_opening_stock(payload jsonb) -- creates an opening batch and/or
--     stock_ledger('opening') row for an XML-imported item.
-- Mirrors stock_rpc.sql's record_stock_adjustment style exactly: security
-- definer, is_member_of_company() guard, audit_log entry.
-- =====================================================================

-- ---------------------------------------------------------------------
-- record_opening_stock
-- Payload shape:
-- {
--   "company_id": uuid,
--   "item_id": uuid,
--   "batch_no": text | null,     -- ignored for a non-batch-tracked item
--   "shade": text | null,
--   "size": text | null,
--   "mrp": number | null,
--   "cost_price": number | null,
--   "qty": number                 -- opening qty; may be 0
-- }
-- A batch-tracked item always gets a new batch row (even for qty = 0, so
-- "OPENINGBALANCE = 0 imports normally" holds); the stock_ledger row is
-- only written when qty <> 0, matching record_stock_adjustment's convention
-- of never writing a zero-movement ledger entry.
-- Returns: { batch_id, ledger_id }  -- batch_id null for non-batch items;
--                                       ledger_id null when qty = 0
-- ---------------------------------------------------------------------
create or replace function record_opening_stock(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  co uuid := (payload->>'company_id')::uuid;
  it_id uuid := (payload->>'item_id')::uuid;
  qty numeric(14,3) := coalesce((payload->>'qty')::numeric, 0);
  cost numeric(14,2) := coalesce((payload->>'cost_price')::numeric, 0);
  item_track_stock boolean;
  item_track_batches boolean;
  b_id uuid;
  ledger_id uuid;
begin
  if not is_member_of_company(co) then
    raise exception 'not a member of company %', co;
  end if;

  select track_stock, track_batches into item_track_stock, item_track_batches
    from items where id = it_id and company_id = co;
  if not found then
    raise exception 'item % not found in company %', it_id, co;
  end if;
  if not item_track_stock then
    raise exception 'item % does not track stock', it_id;
  end if;

  if item_track_batches then
    insert into batches(company_id, item_id, batch_no, shade, size, mrp, cost_price, qty_on_hand)
    values (
      co, it_id, payload->>'batch_no', payload->>'shade', payload->>'size',
      nullif(payload->>'mrp', '')::numeric, cost, qty
    ) returning id into b_id;
  else
    b_id := null;
  end if;

  if qty <> 0 then
    insert into stock_ledger(
      company_id, item_id, batch_id, txn_type,
      ref_table, ref_id, qty_in, qty_out, unit_cost, notes
    ) values (
      co, it_id, b_id, 'opening',
      null, null, greatest(qty, 0), greatest(-qty, 0), cost, 'opening stock (XML import)'
    ) returning id into ledger_id;
  end if;

  insert into audit_log(company_id, actor_user_id, action, table_name, row_id, after_json)
    values (co, auth.uid(), 'stock.opening', 'items', it_id,
            jsonb_build_object('batch_id', b_id, 'qty', qty));

  return jsonb_build_object('batch_id', b_id, 'ledger_id', ledger_id);
end;
$$;
