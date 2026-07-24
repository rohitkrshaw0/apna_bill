-- =====================================================================
-- ApnaBill backup_rpc.sql (Milestone 9D)
-- Run AFTER schema.sql (does not modify or depend on any other *_rpc.sql --
-- purely additive, no schema change: no new tables/columns/constraints).
-- Contents:
--   * generate_company_backup_snapshot(company_id) -- the Tier-1 backup
--     consistency mechanism documented in docs/milestone-9d-backup-report.md:
--     ONE Postgres transaction, REPEATABLE READ isolation, reads all
--     21 company-scoped tables (every table in schema.sql's "generic
--     policy loop" list, plus `companies`/`firms` themselves; deliberately
--     EXCLUDING `company_members`, which is access-control, not business
--     data -- see the design doc's "Deliberately excluded" note) inside
--     that one snapshot, so a sale/payment/stock-change committed anywhere
--     else during the read is invisible to every query in this function,
--     never a torn combination of "new invoice, old payment count."
--
-- NOTE: this SQL has not been run against a live Supabase project from
-- this environment (no database credentials reachable here -- the same
-- limitation noted for every *_rpc.sql file in every prior milestone).
-- SET TRANSACTION ISOLATION LEVEL as the first statements of this function
-- body is a well-established Postgres pattern for exactly this "one RPC
-- call needs a stronger isolation level than the request's default" case,
-- but it has not been verified live; if it is ever rejected in practice,
-- the design doc's Tier 2 (staging-table materialization) is the
-- documented fallback.
-- =====================================================================

-- ---------------------------------------------------------------------
-- generate_company_backup_snapshot
-- Returns one jsonb object: { company, firms, parties, items,
--   item_custom_field_defs, item_custom_field_values, batches,
--   stock_ledger, payment_types, invoice_prefixes, invoices,
--   invoice_lines, payments, purchases, purchase_lines,
--   manufacturing_runs, manufacturing_lines, loyalty_transactions,
--   print_settings, audit_log, invoice_attachments }
-- -- the browser splits this into the .apnabill archive's per-table JSON
-- files afterward; that split is pure serialization on data that's already
-- fully consistent, so it carries no additional consistency risk.
-- ---------------------------------------------------------------------
create or replace function generate_company_backup_snapshot(_company_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  result jsonb;
  co uuid := _company_id;
begin
  -- Must be the first statement in this transaction -- no query, not even
  -- the authorization check below, may run before this. Deliberately NOT
  -- also setting READ ONLY: this function performs one write (the
  -- audit_log insert below), which READ ONLY would reject outright: it
  -- applies to the whole transaction, it cannot "exempt" one statement.
  -- REPEATABLE READ alone already gives every read in this function the
  -- one frozen snapshot the consistency design requires; READ ONLY would
  -- only have been a belt-and-suspenders statement of intent, and a wrong
  -- one given the audit write below.
  set transaction isolation level repeatable read;

  if not is_owner_of_company(co) then
    raise exception 'not an owner/manager of company %', co;
  end if;

  select jsonb_build_object(
    'company', (select to_jsonb(c) from companies c where c.id = co),
    'firms', coalesce((select jsonb_agg(to_jsonb(f) order by f.sort_order) from firms f where f.company_id = co), '[]'::jsonb),
    'parties', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at) from parties p where p.company_id = co), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at) from items i where i.company_id = co), '[]'::jsonb),
    'item_custom_field_defs', coalesce((select jsonb_agg(to_jsonb(d) order by d.sort_order) from item_custom_field_defs d where d.company_id = co), '[]'::jsonb),
    'item_custom_field_values', coalesce((select jsonb_agg(to_jsonb(v)) from item_custom_field_values v where v.company_id = co), '[]'::jsonb),
    'batches', coalesce((select jsonb_agg(to_jsonb(b) order by b.created_at) from batches b where b.company_id = co), '[]'::jsonb),
    'stock_ledger', coalesce((select jsonb_agg(to_jsonb(s) order by s.txn_date) from stock_ledger s where s.company_id = co), '[]'::jsonb),
    'payment_types', coalesce((select jsonb_agg(to_jsonb(pt) order by pt.sort_order) from payment_types pt where pt.company_id = co), '[]'::jsonb),
    'invoice_prefixes', coalesce((select jsonb_agg(to_jsonb(ip)) from invoice_prefixes ip where ip.company_id = co), '[]'::jsonb),
    'invoices', coalesce((select jsonb_agg(to_jsonb(inv) order by inv.invoice_date) from invoices inv where inv.company_id = co), '[]'::jsonb),
    'invoice_lines', coalesce((select jsonb_agg(to_jsonb(il) order by il.invoice_id, il.line_no) from invoice_lines il where il.company_id = co), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(to_jsonb(pay) order by pay.payment_date) from payments pay where pay.company_id = co), '[]'::jsonb),
    'purchases', coalesce((select jsonb_agg(to_jsonb(pu) order by pu.bill_date) from purchases pu where pu.company_id = co), '[]'::jsonb),
    'purchase_lines', coalesce((select jsonb_agg(to_jsonb(pl) order by pl.purchase_id, pl.line_no) from purchase_lines pl where pl.company_id = co), '[]'::jsonb),
    'manufacturing_runs', coalesce((select jsonb_agg(to_jsonb(mr) order by mr.run_date) from manufacturing_runs mr where mr.company_id = co), '[]'::jsonb),
    'manufacturing_lines', coalesce((select jsonb_agg(to_jsonb(ml)) from manufacturing_lines ml where ml.company_id = co), '[]'::jsonb),
    'loyalty_transactions', coalesce((select jsonb_agg(to_jsonb(lt) order by lt.txn_date) from loyalty_transactions lt where lt.company_id = co), '[]'::jsonb),
    'print_settings', coalesce((select jsonb_agg(to_jsonb(ps)) from print_settings ps where ps.company_id = co), '[]'::jsonb),
    'audit_log', coalesce((select jsonb_agg(to_jsonb(al) order by al.created_at) from audit_log al where al.company_id = co), '[]'::jsonb),
    'invoice_attachments', coalesce((select jsonb_agg(to_jsonb(ia)) from invoice_attachments ia where ia.company_id = co), '[]'::jsonb)
  ) into result;

  -- Logged here, inside the same snapshot transaction, so the audit trail
  -- and the data it describes are always consistent with each other. A
  -- plain INSERT of a brand-new row cannot conflict with anything under
  -- REPEATABLE READ -- unlike UPDATE/DELETE, it never risks a
  -- serialization failure, so it's safe to mix into an otherwise
  -- read-heavy snapshot transaction.
  insert into audit_log(company_id, actor_user_id, action, table_name, notes)
    values (co, auth.uid(), 'backup.snapshot_read', null, 'Company backup snapshot read (generate_company_backup_snapshot)');

  return result;
end;
$$;
