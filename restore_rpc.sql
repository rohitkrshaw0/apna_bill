-- =====================================================================
-- ApnaBill restore_rpc.sql (Milestone 9E)
-- Run AFTER schema.sql and backup_rpc.sql (does not modify or depend on
-- any other *_rpc.sql -- purely additive, no schema change: no new tables/
-- columns/constraints).
--
-- Contents:
--   * restore_company_from_snapshot(_company_id, _snapshot) -- the ONLY
--     restore mode implemented in this milestone: "New Company Restore."
--     The target company must be genuinely empty of business data before
--     this function will touch anything; it never merges, and it never
--     overwrites an existing company's transactional history.
--
-- Two restore modes are planned; only the first is implemented here:
--
--   1. New Company Restore (THIS FILE)
--      - Target company must contain zero rows in every table this
--        function considers "business data" (see EMPTY_CHECK_TABLES below).
--      - If any such table already has a row, the whole call aborts with
--        a clear exception naming the offending table -- nothing is
--        deleted or inserted anywhere.
--      - No merge, no partial restore: a plpgsql function body is one
--        transaction, so any exception raised partway through (a
--        constraint violation, a bad snapshot shape) unwinds every
--        DELETE/INSERT this call already made, atomically, for free.
--
--   2. Disaster Recovery Restore (NOT IMPLEMENTED -- planned only)
--      Full replacement of an EXISTING company's data: wipe the same
--      tables this function wipes, but without the "must already be
--      empty" precondition -- i.e. deliberately destructive, intended for
--      "roll this company back to its backup state" rather than "set up a
--      new company from a backup." This is a materially different, higher-
--      blast-radius operation (real transactional history can be
--      destroyed by a wrong companyId or a stale backup) and was
--      explicitly scoped OUT of this milestone. See the 9E design doc for
--      the reasoning; do not repurpose this function for that use case by
--      simply removing the emptiness check -- it needs its own explicit
--      confirmation flow, one layer up, before it should exist at all.
--
-- NOTE: this SQL has not been run against a live Supabase project from
-- this environment (no database credentials reachable here -- the same
-- limitation noted for every prior milestone's *_rpc.sql file, including
-- backup_rpc.sql, which this function is the direct counterpart to).
-- =====================================================================

-- ---------------------------------------------------------------------
-- remap_snapshot_company_id: rewrites the `company_id` key on every
-- element of a jsonb array to the RESTORE TARGET's id, discarding
-- whatever company_id the ORIGINAL (backed-up) company had. This is the
-- one, critical piece of surgery every table's rows need: every other
-- column (every row's own `id`, and every OTHER table's foreign key --
-- invoice_lines.invoice_id, batches.item_id, and so on) is preserved
-- byte-for-byte from the snapshot, which is exactly what keeps the
-- restored data's internal cross-references self-consistent. Only
-- `company_id` itself is a "leaf" reference (nothing else's foreign key
-- points through it), so it is the only column safe -- and necessary --
-- to rewrite.
-- ---------------------------------------------------------------------
create or replace function remap_snapshot_company_id(_rows jsonb, _company_id uuid)
returns jsonb
language sql immutable
as $$
  select coalesce(
    (select jsonb_agg(elem || jsonb_build_object('company_id', _company_id))
     from jsonb_array_elements(coalesce(_rows, '[]'::jsonb)) elem),
    '[]'::jsonb
  );
$$;

-- ---------------------------------------------------------------------
-- restore_company_from_snapshot
-- _snapshot must be shaped exactly like generate_company_backup_snapshot()'s
-- return value (the browser reconstructs this by reading a .apnabill
-- archive's manifest.json + per-table JSON files back into one jsonb
-- object -- see apnabillArchiveParserV1.js -- before calling this RPC).
-- ---------------------------------------------------------------------
create or replace function restore_company_from_snapshot(_company_id uuid, _snapshot jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  co uuid := _company_id;
  tbl_name text;
  row_exists boolean;
  co_rec companies;
  -- Every table this function treats as "business data": restore refuses
  -- to run at all if the target company already has so much as one row in
  -- any of these. Deliberately does NOT include firms/payment_types/
  -- invoice_prefixes (create_company() always seeds these -- see the 9E
  -- design doc's note on why an "empty" company is never literally
  -- zero-rows-everywhere) or company_members (access control, not
  -- business data -- same exclusion backup_rpc.sql already documents).
  empty_check_tables constant text[] := array[
    'parties', 'items', 'item_custom_field_defs', 'item_custom_field_values',
    'batches', 'stock_ledger', 'invoices', 'invoice_lines', 'payments',
    'purchases', 'purchase_lines', 'manufacturing_runs', 'manufacturing_lines',
    'loyalty_transactions', 'print_settings', 'audit_log', 'invoice_attachments'
  ];
begin
  if not is_owner_of_company(co) then
    raise exception 'not an owner/manager of company %', co;
  end if;

  -- ---- Precondition: target must be genuinely empty of business data ----
  -- Checked in full, BEFORE a single delete/insert runs anywhere, so a
  -- rejected restore has made zero changes, not a half-applied one.
  foreach tbl_name in array empty_check_tables loop
    execute format('select exists(select 1 from %I where company_id = $1)', tbl_name)
      into row_exists using co;
    if row_exists then
      raise exception
        'Cannot restore into company %: table "%" already has data -- New Company Restore only supports a genuinely empty target company',
        co, tbl_name;
    end if;
  end loop;

  -- ---- Config tables: safe to wipe unconditionally --------------------
  -- create_company() always seeds a default firm + 5 payment types + 6
  -- invoice prefixes. The precondition above already proved nothing
  -- transactional references those default rows yet (every table that
  -- COULD reference a firm_id/payment_type_id is confirmed empty), so
  -- replacing them with the snapshot's real values is safe: no orphaned
  -- foreign key can result.
  delete from invoice_prefixes where company_id = co;
  delete from payment_types where company_id = co;
  delete from firms where company_id = co;

  insert into firms
    select * from jsonb_populate_recordset(null::firms, remap_snapshot_company_id(_snapshot->'firms', co));
  insert into payment_types
    select * from jsonb_populate_recordset(null::payment_types, remap_snapshot_company_id(_snapshot->'payment_types', co));
  insert into invoice_prefixes
    select * from jsonb_populate_recordset(null::invoice_prefixes, remap_snapshot_company_id(_snapshot->'invoice_prefixes', co));

  -- ---- Business data: inserted in dependency order ---------------------
  -- (batches.purchase_id carries no foreign key constraint -- see
  -- schema.sql -- so batches never needs to wait for purchases.)
  insert into parties
    select * from jsonb_populate_recordset(null::parties, remap_snapshot_company_id(_snapshot->'parties', co));
  insert into items
    select * from jsonb_populate_recordset(null::items, remap_snapshot_company_id(_snapshot->'items', co));
  insert into item_custom_field_defs
    select * from jsonb_populate_recordset(null::item_custom_field_defs, remap_snapshot_company_id(_snapshot->'item_custom_field_defs', co));
  insert into item_custom_field_values
    select * from jsonb_populate_recordset(null::item_custom_field_values, remap_snapshot_company_id(_snapshot->'item_custom_field_values', co));
  insert into batches
    select * from jsonb_populate_recordset(null::batches, remap_snapshot_company_id(_snapshot->'batches', co));
  insert into stock_ledger
    select * from jsonb_populate_recordset(null::stock_ledger, remap_snapshot_company_id(_snapshot->'stock_ledger', co));
  insert into invoices
    select * from jsonb_populate_recordset(null::invoices, remap_snapshot_company_id(_snapshot->'invoices', co));
  insert into purchases
    select * from jsonb_populate_recordset(null::purchases, remap_snapshot_company_id(_snapshot->'purchases', co));
  insert into invoice_lines
    select * from jsonb_populate_recordset(null::invoice_lines, remap_snapshot_company_id(_snapshot->'invoice_lines', co));
  insert into purchase_lines
    select * from jsonb_populate_recordset(null::purchase_lines, remap_snapshot_company_id(_snapshot->'purchase_lines', co));
  insert into payments
    select * from jsonb_populate_recordset(null::payments, remap_snapshot_company_id(_snapshot->'payments', co));
  insert into manufacturing_runs
    select * from jsonb_populate_recordset(null::manufacturing_runs, remap_snapshot_company_id(_snapshot->'manufacturing_runs', co));
  insert into manufacturing_lines
    select * from jsonb_populate_recordset(null::manufacturing_lines, remap_snapshot_company_id(_snapshot->'manufacturing_lines', co));
  insert into loyalty_transactions
    select * from jsonb_populate_recordset(null::loyalty_transactions, remap_snapshot_company_id(_snapshot->'loyalty_transactions', co));
  insert into print_settings
    select * from jsonb_populate_recordset(null::print_settings, remap_snapshot_company_id(_snapshot->'print_settings', co));
  insert into invoice_attachments
    select * from jsonb_populate_recordset(null::invoice_attachments, remap_snapshot_company_id(_snapshot->'invoice_attachments', co));

  -- Historical audit_log rows from the ORIGINAL company, restored as-is
  -- (each keeps its own original id/created_at -- it is a factual record
  -- of what happened to the ORIGINAL company, not something "restore"
  -- should rewrite), then one NEW row recording this restore itself,
  -- exactly mirroring backup_rpc.sql's own "log inside the same
  -- transaction as the data it describes" pattern.
  insert into audit_log
    select * from jsonb_populate_recordset(null::audit_log, remap_snapshot_company_id(_snapshot->'audit_log', co));
  insert into audit_log(company_id, actor_user_id, action, table_name, notes)
    values (co, auth.uid(), 'restore.new_company_restore', null, 'Company restored from a .apnabill backup snapshot (restore_company_from_snapshot)');

  -- ---- companies row itself: UPDATE, never INSERT ----------------------
  -- The snapshot's `company` object carries the ORIGINAL company's id,
  -- which must NEVER be written here -- co (this call's actual target)
  -- already exists (it was created normally, then confirmed empty above).
  -- Only the substantive business fields are restored; id/created_by/
  -- created_at/is_active stay exactly as they are on the target row --
  -- ownership and row identity belong to the CURRENT Supabase project,
  -- not to whatever the backup happened to record.
  select * into co_rec from jsonb_populate_record(null::companies, coalesce(_snapshot->'company', '{}'::jsonb));
  update companies set
    name = coalesce(co_rec.name, name),
    fy_start_month = coalesce(co_rec.fy_start_month, fy_start_month),
    loyalty_enabled = coalesce(co_rec.loyalty_enabled, loyalty_enabled),
    loyalty_earn_per_100 = coalesce(co_rec.loyalty_earn_per_100, loyalty_earn_per_100),
    loyalty_redeem_value = coalesce(co_rec.loyalty_redeem_value, loyalty_redeem_value),
    loyalty_min_redeem_points = coalesce(co_rec.loyalty_min_redeem_points, loyalty_min_redeem_points)
  where id = co;
end;
$$;
