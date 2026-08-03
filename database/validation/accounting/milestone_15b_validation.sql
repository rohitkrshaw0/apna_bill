-- =====================================================================
-- Milestone 15B (Journal Engine) — Accounting Platform Validation Script
-- =====================================================================
-- PURPOSE
--   Validates the Journal Engine's database implementation (schema.sql's
--   accounting tables + accounting_rpc.sql's three RPCs) against a REAL
--   Postgres/Supabase instance. This script does NOT apply schema.sql or
--   accounting_rpc.sql itself -- both must already be applied before
--   running this.
--
--   PERMANENT REGRESSION ASSET, not a one-off diagnostic: this earned its
--   place in the repository during Milestone 15B's own pre-merge review,
--   where running it live (not just reading the code) caught two real
--   defects a static read had missed. Any future milestone that touches
--   js/services/accounting/**, schema.sql's accounting tables, or
--   accounting_rpc.sql (15C's Manual Journal Engine, Posting Preview,
--   Posting History, Posting Approval, Recurring Journals, and beyond)
--   should re-run this against staging before merging, exactly the way
--   this milestone did, and extend it in place -- with new #N-numbered
--   sections following the same PASS/FAIL/SKIP-into-a-temp-table
--   convention -- rather than writing a parallel, one-off script.
--
-- SAFETY
--   The entire script runs inside one explicit transaction and ends
--   with ROLLBACK -- nothing it creates (test companies, accounts,
--   journal entries, fiscal periods, company memberships, and the
--   temporary results table below) survives past this run. Every test
--   row is also named "__15B_VALIDATION_TEST__..." as a second,
--   belt-and-suspenders identifier in case anything is ever inspected
--   mid-transaction or the rollback is skipped by mistake. Nothing here
--   permanently alters real data.
--
--   Two ordinary SQL check_violation warnings you WILL see are expected
--   and correct — they are Postgres reporting a constraint working as
--   intended; the script catches them and reports PASS.
--
-- HOW TO READ THE RESULTS
--   Every check is recorded exactly once, in order, into a temporary
--   table and ALSO still emitted via RAISE NOTICE (unchanged from the
--   original version of this script, for anyone tailing Postgres logs).
--   The very last statement in this script is a SELECT against that
--   table -- that is what the Supabase SQL Editor's results grid will
--   show. Each row reads:
--     PASS  (#N <name>): <what was confirmed>
--     FAIL  (#N <name>): <what went wrong, with the exact error text>
--     SKIP  (#N <name>): <why this check could not run>
--   A final summary row reports the overall PASS/FAIL/SKIP tally and,
--   if everything passed, an explicit "ALL CHECKS PASSED" row.
--
--   #1–#15 below map exactly to the 15 items requested for Milestone 15B's
--   own pre-merge review. A future extension should keep numbering new
--   sections upward from #16 rather than renumbering these, so a given
--   number always means the same check across every run.
-- =====================================================================

begin;

-- Rolled back with everything else at the end of this script -- exists
-- only so the final SELECT below has something to select from.
create temporary table _15b_validation_log (
  seq     bigint generated always as identity,
  message text not null
);

-- The script later runs `set local role authenticated` to exercise RLS
-- as a real end user -- from that point on, every statement (including
-- our own logging inserts) executes AS `authenticated`, not as the
-- owning/superuser role that created this table. `authenticated` has no
-- privilege on a table it doesn't own until granted one, so without this
-- grant the very first log insert issued after the role switch fails
-- with "permission denied for table _15b_validation_log" -- which is
-- exactly the error being fixed here. This grant only touches this
-- scratch logging table; it does not affect, weaken, or bypass any RLS
-- policy on accounts/fiscal_periods/journal_entries/journal_lines --
-- those remain exactly as strict as before, which is the entire point
-- of switching roles in the first place.
grant select, insert on _15b_validation_log to authenticated;

do $$
declare
  -- ---- identities (fake, self-contained -- no dependency on real
  -- Supabase Auth users; company_members.user_id has no FK to auth.users,
  -- so any uuid works for RLS/ownership testing) ----
  v_user_a          uuid := gen_random_uuid();
  v_user_a_cashier  uuid := gen_random_uuid();
  v_user_b          uuid := gen_random_uuid();

  v_company_a uuid;
  v_company_b uuid;

  v_account_cash  uuid;
  v_account_sales uuid;

  v_ref_id_1 uuid := gen_random_uuid();
  v_ref_id_2 uuid := gen_random_uuid();

  v_je1_id uuid;
  v_je1_no text;
  v_je2_id uuid;
  v_je2_no text;
  v_rev_id uuid;

  v_pass int := 0;
  v_fail int := 0;
  v_skip int := 0;

  v_count      int;
  v_count2     int;
  v_line_count int;
  v_sum_debit  numeric;
  v_sum_credit numeric;
  v_result     jsonb;
  v_result2    jsonb;
  v_text       text;
  v_auth_works boolean := false;
begin
  raise notice '=====================================================================';
  insert into _15b_validation_log(message) values ('=====================================================================');
  raise notice 'Milestone 15B Journal Engine -- Staging Validation -- started at %', clock_timestamp();
  insert into _15b_validation_log(message) values (format('Milestone 15B Journal Engine -- Staging Validation -- started at %s', clock_timestamp()));
  raise notice '=====================================================================';
  insert into _15b_validation_log(message) values ('=====================================================================');

  -- =====================================================================
  -- #1 Schema integrity
  -- =====================================================================
  begin
    select count(*) into v_count from information_schema.tables
      where table_schema = 'public' and table_name in
        ('accounts','fiscal_periods','journal_entries','journal_lines','accounting_settings','journal_number_counters');
    if v_count = 6 then
      v_pass := v_pass + 1;
      raise notice 'PASS (#1 schema integrity): all 6 Milestone 15B tables exist';
      insert into _15b_validation_log(message) values ('PASS (#1 schema integrity): all 6 Milestone 15B tables exist');
    else
      v_fail := v_fail + 1;
      raise notice 'FAIL (#1 schema integrity): expected 6 tables, found % -- missing: %', v_count,
        (select string_agg(t, ', ') from unnest(array['accounts','fiscal_periods','journal_entries','journal_lines','accounting_settings','journal_number_counters']) t
         where t not in (select table_name from information_schema.tables where table_schema='public'));
      insert into _15b_validation_log(message) values (format('FAIL (#1 schema integrity): expected 6 tables, found %s -- missing: %s', v_count,
        (select string_agg(t, ', ') from unnest(array['accounts','fiscal_periods','journal_entries','journal_lines','accounting_settings','journal_number_counters']) t
         where t not in (select table_name from information_schema.tables where table_schema='public'))));
    end if;
  exception when others then
    v_fail := v_fail + 1;
    raise notice 'FAIL (#1 schema integrity): unexpected error: %', sqlerrm;
    insert into _15b_validation_log(message) values (format('FAIL (#1 schema integrity): unexpected error: %s', sqlerrm));
  end;

  begin
    select count(*) into v_count from information_schema.columns
      where table_schema = 'public' and (
        (table_name = 'accounts' and column_name in ('normal_balance','category','type','parent_id','status')) or
        (table_name = 'journal_entries' and column_name in ('ref_table','ref_id','voucher_type','posting_source','reverses_journal_id','reversed_by_journal_id')) or
        (table_name = 'journal_lines' and column_name in ('debit','credit','account_id')) or
        (table_name = 'fiscal_periods' and column_name in ('status','start_date','end_date')) or
        (table_name = 'accounting_settings' and column_name = 'account_map') or
        (table_name = 'journal_number_counters' and column_name in ('next_seq','fy_label'))
      );
    if v_count = 20 then
      v_pass := v_pass + 1;
      raise notice 'PASS (#1 schema integrity): all 20 expected key columns present';
      insert into _15b_validation_log(message) values ('PASS (#1 schema integrity): all 20 expected key columns present');
    else
      v_fail := v_fail + 1;
      raise notice 'FAIL (#1 schema integrity): expected 20 key columns, found %', v_count;
      insert into _15b_validation_log(message) values (format('FAIL (#1 schema integrity): expected 20 key columns, found %s', v_count));
    end if;
  exception when others then
    v_fail := v_fail + 1;
    raise notice 'FAIL (#1 schema integrity): unexpected error: %', sqlerrm;
    insert into _15b_validation_log(message) values (format('FAIL (#1 schema integrity): unexpected error: %s', sqlerrm));
  end;

  -- =====================================================================
  -- #2 Foreign keys
  -- =====================================================================
  begin
    select count(*) into v_count from (
      values
        ('accounts','company_id','companies'),
        ('accounts','parent_id','accounts'),
        ('fiscal_periods','company_id','companies'),
        ('journal_entries','company_id','companies'),
        ('journal_entries','fiscal_period_id','fiscal_periods'),
        ('journal_entries','reverses_journal_id','journal_entries'),
        ('journal_entries','reversed_by_journal_id','journal_entries'),
        ('journal_lines','company_id','companies'),
        ('journal_lines','journal_entry_id','journal_entries'),
        ('journal_lines','account_id','accounts'),
        ('accounting_settings','company_id','companies'),
        ('journal_number_counters','company_id','companies')
    ) as expected(tbl, col, ref_tbl)
    where exists (
      select 1
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
      join information_schema.constraint_column_usage ccu
        on tc.constraint_name = ccu.constraint_name and tc.table_schema = ccu.table_schema
      where tc.constraint_type = 'FOREIGN KEY'
        and tc.table_schema = 'public'
        and tc.table_name = expected.tbl
        and kcu.column_name = expected.col
        and ccu.table_name = expected.ref_tbl
    );
    if v_count = 12 then
      v_pass := v_pass + 1;
      raise notice 'PASS (#2 foreign keys): all 12 expected foreign keys present';
      insert into _15b_validation_log(message) values ('PASS (#2 foreign keys): all 12 expected foreign keys present');
    else
      v_fail := v_fail + 1;
      raise notice 'FAIL (#2 foreign keys): expected 12 matching foreign keys, found %', v_count;
      insert into _15b_validation_log(message) values (format('FAIL (#2 foreign keys): expected 12 matching foreign keys, found %s', v_count));
    end if;
  exception when others then
    v_fail := v_fail + 1;
    raise notice 'FAIL (#2 foreign keys): unexpected error: %', sqlerrm;
    insert into _15b_validation_log(message) values (format('FAIL (#2 foreign keys): unexpected error: %s', sqlerrm));
  end;

  -- =====================================================================
  -- #6 SECURITY DEFINER RPCs (checked before creating any test data)
  -- =====================================================================
  begin
    select count(*) into v_count from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('post_journal_entry','reverse_journal_entry','next_journal_number','bootstrap_accounting_defaults','create_company')
        and p.prosecdef = true;
    if v_count = 5 then
      v_pass := v_pass + 1;
      raise notice 'PASS (#6 security definer RPCs): all 5 expected functions exist and are SECURITY DEFINER';
      insert into _15b_validation_log(message) values ('PASS (#6 security definer RPCs): all 5 expected functions exist and are SECURITY DEFINER');
    else
      v_fail := v_fail + 1;
      raise notice 'FAIL (#6 security definer RPCs): expected 5 SECURITY DEFINER functions, found %', v_count;
      insert into _15b_validation_log(message) values (format('FAIL (#6 security definer RPCs): expected 5 SECURITY DEFINER functions, found %s', v_count));
    end if;
  exception when others then
    v_fail := v_fail + 1;
    raise notice 'FAIL (#6 security definer RPCs): unexpected error: %', sqlerrm;
    insert into _15b_validation_log(message) values (format('FAIL (#6 security definer RPCs): unexpected error: %s', sqlerrm));
  end;

  begin
    select pg_get_function_arguments(p.oid) into v_text from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'post_journal_entry' limit 1;
    if v_text ilike '%payload%jsonb%' then
      v_pass := v_pass + 1;
      raise notice 'PASS (#6 RPC signatures): post_journal_entry(payload jsonb) signature matches';
      insert into _15b_validation_log(message) values ('PASS (#6 RPC signatures): post_journal_entry(payload jsonb) signature matches');
    else
      v_fail := v_fail + 1;
      raise notice 'FAIL (#6 RPC signatures): post_journal_entry signature unexpected: %', coalesce(v_text, '<function not found>');
      insert into _15b_validation_log(message) values (format('FAIL (#6 RPC signatures): post_journal_entry signature unexpected: %s', coalesce(v_text, '<function not found>')));
    end if;
  exception when others then
    v_fail := v_fail + 1;
    raise notice 'FAIL (#6 RPC signatures): unexpected error: %', sqlerrm;
    insert into _15b_validation_log(message) values (format('FAIL (#6 RPC signatures): unexpected error: %s', sqlerrm));
  end;

  -- =====================================================================
  -- #5 RLS policies -- part A: enabled + expected policies exist
  -- =====================================================================
  begin
    select count(*) into v_count from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in ('accounts','fiscal_periods','journal_entries','journal_lines','accounting_settings','journal_number_counters')
        and c.relrowsecurity = true;
    if v_count = 6 then
      v_pass := v_pass + 1;
      raise notice 'PASS (#5 RLS policies): row level security is enabled on all 6 tables';
      insert into _15b_validation_log(message) values ('PASS (#5 RLS policies): row level security is enabled on all 6 tables');
    else
      v_fail := v_fail + 1;
      raise notice 'FAIL (#5 RLS policies): expected RLS enabled on 6 tables, found %', v_count;
      insert into _15b_validation_log(message) values (format('FAIL (#5 RLS policies): expected RLS enabled on 6 tables, found %s', v_count));
    end if;
  exception when others then
    v_fail := v_fail + 1;
    raise notice 'FAIL (#5 RLS policies): unexpected error: %', sqlerrm;
    insert into _15b_validation_log(message) values (format('FAIL (#5 RLS policies): unexpected error: %s', sqlerrm));
  end;

  -- The core design decision under test: journal_entries, journal_lines,
  -- fiscal_periods, and journal_number_counters must have ZERO
  -- insert/update/delete policies -- every write must go through the
  -- two RPCs, never a direct client write.
  begin
    select count(*) into v_count from pg_policies
      where schemaname = 'public'
        and tablename in ('journal_entries','journal_lines','fiscal_periods','journal_number_counters')
        and cmd in ('INSERT','UPDATE','DELETE','ALL');
    if v_count = 0 then
      v_pass := v_pass + 1;
      raise notice 'PASS (#5 RLS policies): journal_entries/journal_lines/fiscal_periods/journal_number_counters have no client write policy (default-deny confirmed)';
      insert into _15b_validation_log(message) values ('PASS (#5 RLS policies): journal_entries/journal_lines/fiscal_periods/journal_number_counters have no client write policy (default-deny confirmed)');
    else
      v_fail := v_fail + 1;
      raise notice 'FAIL (#5 RLS policies): found % unexpected write polic(y/ies) on tables that should be read-only to clients', v_count;
      insert into _15b_validation_log(message) values (format('FAIL (#5 RLS policies): found %s unexpected write polic(y/ies) on tables that should be read-only to clients', v_count));
    end if;
  exception when others then
    v_fail := v_fail + 1;
    raise notice 'FAIL (#5 RLS policies): unexpected error: %', sqlerrm;
    insert into _15b_validation_log(message) values (format('FAIL (#5 RLS policies): unexpected error: %s', sqlerrm));
  end;

  -- =====================================================================
  -- Establish auth impersonation for user A, create Company A.
  -- Everything from here on needs auth.uid() to resolve -- if this
  -- doesn't work on this Postgres/Supabase version, every remaining
  -- section is marked SKIP rather than a false FAIL.
  -- =====================================================================
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_user_a::text, true);
    execute 'set local role authenticated';
    if auth.uid() = v_user_a then
      v_auth_works := true;
    end if;
    execute 'reset role';
  exception when others then
    v_auth_works := false;
    raise notice 'NOTE: auth impersonation setup raised %  -- functional sections will be SKIPPED', sqlerrm;
    insert into _15b_validation_log(message) values (format('NOTE: auth impersonation setup raised %s  -- functional sections will be SKIPPED', sqlerrm));
  end;

  if not v_auth_works then
    v_skip := v_skip + 12; -- #3,#4,#5(part B),#7,#8,#9,#10,#11,#12,#13,#14,#15
    raise notice 'SKIP (#3,#4,#5b,#7,#8,#9,#10,#11,#12,#13,#14,#15): auth.uid() impersonation via request.jwt.claims did not return the expected test uuid on this Postgres/Supabase version -- every functional check requiring a real caller identity was skipped. This needs a different impersonation technique for this environment before those items can be validated.';
    insert into _15b_validation_log(message) values ('SKIP (#3,#4,#5b,#7,#8,#9,#10,#11,#12,#13,#14,#15): auth.uid() impersonation via request.jwt.claims did not return the expected test uuid on this Postgres/Supabase version -- every functional check requiring a real caller identity was skipped. This needs a different impersonation technique for this environment before those items can be validated.');
  else

    -- become user A, create Company A (also exercises #7 and #12)
    perform set_config('request.jwt.claims', json_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_user_a::text, true);
    execute 'set local role authenticated';

    begin
      select create_company('__15B_VALIDATION_TEST__ Company A', 'Test Firm A', false) into v_company_a;
      v_pass := v_pass + 1;
      raise notice 'PASS (setup): Company A created (%)', v_company_a;
      insert into _15b_validation_log(message) values (format('PASS (setup): Company A created (%s)', v_company_a));
    exception when others then
      v_fail := v_fail + 1;
      raise notice 'FAIL (setup): create_company() for Company A raised: %', sqlerrm;
      insert into _15b_validation_log(message) values (format('FAIL (setup): create_company() for Company A raised: %s', sqlerrm));
    end;

    execute 'reset role';

    if v_company_a is null then
      v_skip := v_skip + 12;
      raise notice 'SKIP (#3,#4,#5b,#7,#8,#9,#10,#11,#12,#13,#14,#15): Company A was not created, so every check depending on it was skipped.';
      insert into _15b_validation_log(message) values ('SKIP (#3,#4,#5b,#7,#8,#9,#10,#11,#12,#13,#14,#15): Company A was not created, so every check depending on it was skipped.');
    else

      -- =====================================================================
      -- #7 create_company() accounting bootstrap  (+ #12 fiscal period creation)
      -- =====================================================================
      begin
        select count(*) into v_count from fiscal_periods
          where company_id = v_company_a and status = 'open' and current_date between start_date and end_date;
        if v_count = 1 then
          v_pass := v_pass + 1;
          raise notice 'PASS (#7/#12 bootstrap + fiscal period): exactly one open fiscal period covers today for Company A';
          insert into _15b_validation_log(message) values ('PASS (#7/#12 bootstrap + fiscal period): exactly one open fiscal period covers today for Company A');
        else
          v_fail := v_fail + 1;
          raise notice 'FAIL (#7/#12 bootstrap + fiscal period): expected exactly 1 open period covering today, found %', v_count;
          insert into _15b_validation_log(message) values (format('FAIL (#7/#12 bootstrap + fiscal period): expected exactly 1 open period covering today, found %s', v_count));
        end if;
      exception when others then
        v_fail := v_fail + 1;
        raise notice 'FAIL (#7/#12 bootstrap + fiscal period): unexpected error: %', sqlerrm;
        insert into _15b_validation_log(message) values (format('FAIL (#7/#12 bootstrap + fiscal period): unexpected error: %s', sqlerrm));
      end;

      begin
        select count(*) into v_count from accounts where company_id = v_company_a;
        if v_count = 16 then
          v_pass := v_pass + 1;
          raise notice 'PASS (#7 bootstrap): default chart of accounts has exactly 16 accounts';
          insert into _15b_validation_log(message) values ('PASS (#7 bootstrap): default chart of accounts has exactly 16 accounts');
        else
          v_fail := v_fail + 1;
          raise notice 'FAIL (#7 bootstrap): expected 16 default accounts, found %', v_count;
          insert into _15b_validation_log(message) values (format('FAIL (#7 bootstrap): expected 16 default accounts, found %s', v_count));
        end if;
      exception when others then
        v_fail := v_fail + 1;
        raise notice 'FAIL (#7 bootstrap): unexpected error: %', sqlerrm;
        insert into _15b_validation_log(message) values (format('FAIL (#7 bootstrap): unexpected error: %s', sqlerrm));
      end;

      begin
        select account_map into v_result from accounting_settings where company_id = v_company_a;
        if v_result is not null and (
             select count(*) from jsonb_object_keys(v_result) k
             where k in ('salesAccount','cashAccount','accountsReceivableAccount','accountsPayableAccount',
                         'outputCgstAccount','outputSgstAccount','outputIgstAccount','outputCessAccount',
                         'inputCgstAccount','inputSgstAccount','inputIgstAccount','inputCessAccount',
                         'purchaseAccount','inventoryAccount','manufacturingOverheadAccount','roundingAccount')
           ) = 16 then
          v_pass := v_pass + 1;
          raise notice 'PASS (#7 bootstrap): accounting_settings.account_map maps all 16 expected roles';
          insert into _15b_validation_log(message) values ('PASS (#7 bootstrap): accounting_settings.account_map maps all 16 expected roles');
        else
          v_fail := v_fail + 1;
          raise notice 'FAIL (#7 bootstrap): accounting_settings.account_map missing expected roles -- found: %', coalesce(v_result::text, '<no row>');
          insert into _15b_validation_log(message) values (format('FAIL (#7 bootstrap): accounting_settings.account_map missing expected roles -- found: %s', coalesce(v_result::text, '<no row>')));
        end if;
      exception when others then
        v_fail := v_fail + 1;
        raise notice 'FAIL (#7 bootstrap): unexpected error: %', sqlerrm;
        insert into _15b_validation_log(message) values (format('FAIL (#7 bootstrap): unexpected error: %s', sqlerrm));
      end;

      select id into v_account_cash from accounts where company_id = v_company_a and code = '1000';
      select id into v_account_sales from accounts where company_id = v_company_a and code = '4000';

      -- add a non-owner member of Company A for the #14 owner-only-reversal
      -- test -- inserted directly (setup only, not itself under test)
      begin
        insert into company_members(company_id, user_id, role) values (v_company_a, v_user_a_cashier, 'cashier');
      exception when others then
        raise notice 'NOTE (setup): could not add cashier member to Company A: %', sqlerrm;
        insert into _15b_validation_log(message) values (format('NOTE (setup): could not add cashier member to Company A: %s', sqlerrm));
      end;

      -- =====================================================================
      -- #3 Unique constraints (functional: attempt the violation, expect rejection)
      -- =====================================================================
      begin
        begin
          insert into accounts(company_id, code, name, category, type, normal_balance, status)
            values (v_company_a, '1000', '__15B_VALIDATION_TEST__ duplicate code', 'cash', 'cash', 'debit', 'active');
          v_fail := v_fail + 1;
          raise notice 'FAIL (#3 unique constraints): a duplicate accounts(company_id, code) row was NOT rejected';
          insert into _15b_validation_log(message) values ('FAIL (#3 unique constraints): a duplicate accounts(company_id, code) row was NOT rejected');
        exception when unique_violation then
          v_pass := v_pass + 1;
          raise notice 'PASS (#3 unique constraints): duplicate accounts(company_id, code) correctly rejected: %', sqlerrm;
          insert into _15b_validation_log(message) values (format('PASS (#3 unique constraints): duplicate accounts(company_id, code) correctly rejected: %s', sqlerrm));
        end;
      exception when others then
        v_fail := v_fail + 1;
        raise notice 'FAIL (#3 unique constraints): unexpected error: %', sqlerrm;
        insert into _15b_validation_log(message) values (format('FAIL (#3 unique constraints): unexpected error: %s', sqlerrm));
      end;

      -- =====================================================================
      -- #4 Check constraints (functional: attempt each violation)
      -- =====================================================================
      begin
        begin
          insert into accounts(company_id, code, name, category, type, normal_balance, status)
            values (v_company_a, '__TEST_BAD__', '__15B_VALIDATION_TEST__ bad normal_balance', 'cash', 'cash', 'sideways', 'active');
          v_fail := v_fail + 1;
          raise notice 'FAIL (#4 check constraints): accounts.normal_balance accepted an invalid value';
          insert into _15b_validation_log(message) values ('FAIL (#4 check constraints): accounts.normal_balance accepted an invalid value');
        exception when check_violation then
          v_pass := v_pass + 1;
          raise notice 'PASS (#4 check constraints): accounts.normal_balance check rejected an invalid value: %', sqlerrm;
          insert into _15b_validation_log(message) values (format('PASS (#4 check constraints): accounts.normal_balance check rejected an invalid value: %s', sqlerrm));
        end;
      exception when others then
        v_fail := v_fail + 1;
        raise notice 'FAIL (#4 check constraints): unexpected error (normal_balance case): %', sqlerrm;
        insert into _15b_validation_log(message) values (format('FAIL (#4 check constraints): unexpected error (normal_balance case): %s', sqlerrm));
      end;

      begin
        begin
          insert into fiscal_periods(company_id, fiscal_year, label, start_date, end_date, status)
            values (v_company_a, '__TEST__', '__15B_VALIDATION_TEST__ inverted dates', '2030-01-01', '2029-01-01', 'open');
          v_fail := v_fail + 1;
          raise notice 'FAIL (#4 check constraints): fiscal_periods accepted end_date before start_date';
          insert into _15b_validation_log(message) values ('FAIL (#4 check constraints): fiscal_periods accepted end_date before start_date');
        exception when check_violation then
          v_pass := v_pass + 1;
          raise notice 'PASS (#4 check constraints): fiscal_periods start_date<=end_date check rejected inverted dates: %', sqlerrm;
          insert into _15b_validation_log(message) values (format('PASS (#4 check constraints): fiscal_periods start_date<=end_date check rejected inverted dates: %s', sqlerrm));
        end;
      exception when others then
        v_fail := v_fail + 1;
        raise notice 'FAIL (#4 check constraints): unexpected error (fiscal_periods case): %', sqlerrm;
        insert into _15b_validation_log(message) values (format('FAIL (#4 check constraints): unexpected error (fiscal_periods case): %s', sqlerrm));
      end;

      begin
        begin
          insert into journal_entries(company_id, fiscal_period_id, journal_no, fy_label, entry_date, voucher_type, posting_source, ref_table, ref_id, created_by)
            select v_company_a, id, '__TEST_JE__', fiscal_year, current_date, 'journal', 'manual', 'invoices', null, v_user_a
            from fiscal_periods where company_id = v_company_a and status = 'open' limit 1;
          v_fail := v_fail + 1;
          raise notice 'FAIL (#4 check constraints): journal_entries accepted ref_table set with ref_id null';
          insert into _15b_validation_log(message) values ('FAIL (#4 check constraints): journal_entries accepted ref_table set with ref_id null');
        exception when check_violation then
          v_pass := v_pass + 1;
          raise notice 'PASS (#4 check constraints): journal_entries (ref_table is null) = (ref_id is null) check rejected a mismatched pair: %', sqlerrm;
          insert into _15b_validation_log(message) values (format('PASS (#4 check constraints): journal_entries (ref_table is null) = (ref_id is null) check rejected a mismatched pair: %s', sqlerrm));
        end;
      exception when others then
        v_fail := v_fail + 1;
        raise notice 'FAIL (#4 check constraints): unexpected error (ref_table/ref_id pairing case): %', sqlerrm;
        insert into _15b_validation_log(message) values (format('FAIL (#4 check constraints): unexpected error (ref_table/ref_id pairing case): %s', sqlerrm));
      end;

      -- direct-write bypass check, tied to #5's RLS design: even though
      -- the statement above used a technically-valid row shape, confirm a
      -- real client (authenticated, real company member) attempting a
      -- direct journal_entries insert is rejected by RLS regardless of
      -- data validity -- there is no insert policy at all.
      begin
        perform set_config('request.jwt.claims', json_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);
        perform set_config('request.jwt.claim.sub', v_user_a::text, true);
        execute 'set local role authenticated';
        begin
          insert into journal_entries(company_id, fiscal_period_id, journal_no, fy_label, entry_date, voucher_type, posting_source, created_by)
            select v_company_a, id, '__TEST_BYPASS__', fiscal_year, current_date, 'journal', 'manual', v_user_a
            from fiscal_periods where company_id = v_company_a and status = 'open' limit 1;
          v_fail := v_fail + 1;
          raise notice 'FAIL (#5 RLS policies): a real company member''s DIRECT insert into journal_entries was NOT rejected -- the posting façade can be bypassed';
          insert into _15b_validation_log(message) values ('FAIL (#5 RLS policies): a real company member''s DIRECT insert into journal_entries was NOT rejected -- the posting façade can be bypassed');
        exception when others then
          v_pass := v_pass + 1;
          raise notice 'PASS (#5 RLS policies): a real company member''s direct journal_entries insert was rejected -- %', sqlerrm;
          insert into _15b_validation_log(message) values (format('PASS (#5 RLS policies): a real company member''s direct journal_entries insert was rejected -- %s', sqlerrm));
        end;
        execute 'reset role';
      exception when others then
        v_fail := v_fail + 1;
        raise notice 'FAIL (#5 RLS policies): unexpected error during direct-write bypass check: %', sqlerrm;
        insert into _15b_validation_log(message) values (format('FAIL (#5 RLS policies): unexpected error during direct-write bypass check: %s', sqlerrm));
        begin execute 'reset role'; exception when others then null; end;
      end;

      -- =====================================================================
      -- #8 next_journal_number()
      -- =====================================================================
      begin
        declare
          v_fy text;
          v_no1 text;
          v_no2 text;
        begin
          select fiscal_year into v_fy from fiscal_periods where company_id = v_company_a and status = 'open' limit 1;
          select journal_no into v_no1 from next_journal_number(v_company_a, v_fy);
          select journal_no into v_no2 from next_journal_number(v_company_a, v_fy);
          if v_no1 is not null and v_no2 is not null and v_no1 <> v_no2 and v_no2 > v_no1 then
            v_pass := v_pass + 1;
            raise notice 'PASS (#8 next_journal_number): two calls produced sequential numbers % then %', v_no1, v_no2;
            insert into _15b_validation_log(message) values (format('PASS (#8 next_journal_number): two calls produced sequential numbers %s then %s', v_no1, v_no2));
          else
            v_fail := v_fail + 1;
            raise notice 'FAIL (#8 next_journal_number): expected two increasing sequential numbers, got % then %', v_no1, v_no2;
            insert into _15b_validation_log(message) values (format('FAIL (#8 next_journal_number): expected two increasing sequential numbers, got %s then %s', v_no1, v_no2));
          end if;
        end;
      exception when others then
        v_fail := v_fail + 1;
        raise notice 'FAIL (#8 next_journal_number): unexpected error: %', sqlerrm;
        insert into _15b_validation_log(message) values (format('FAIL (#8 next_journal_number): unexpected error: %s', sqlerrm));
      end;

      -- =====================================================================
      -- #9 post_journal_entry() creates a balanced journal
      -- =====================================================================
      begin
        if v_account_cash is null or v_account_sales is null then
          v_skip := v_skip + 1;
          raise notice 'SKIP (#9 post_journal_entry): default Cash/Sales accounts not found -- see #7 result above';
          insert into _15b_validation_log(message) values ('SKIP (#9 post_journal_entry): default Cash/Sales accounts not found -- see #7 result above');
        else
          select post_journal_entry(jsonb_build_object(
            'company_id', v_company_a,
            'entry_date', current_date,
            'voucher_type', 'sales',
            'posting_source', 'sales',
            'reference', '__15B_VALIDATION_TEST__ INV-0001',
            'ref_table', 'invoices',
            'ref_id', v_ref_id_1,
            'created_by', v_user_a,
            'lines', jsonb_build_array(
              jsonb_build_object('account_id', v_account_cash, 'debit', 100, 'credit', 0),
              jsonb_build_object('account_id', v_account_sales, 'debit', 0, 'credit', 100)
            )
          )) into v_result;

          v_je1_id := (v_result->>'journal_id')::uuid;
          v_je1_no := v_result->>'journal_no';

          select count(*), coalesce(sum(debit),0), coalesce(sum(credit),0)
            into v_line_count, v_sum_debit, v_sum_credit
            from journal_lines where journal_entry_id = v_je1_id;

          -- line_count=2 and sum_debit>0 are both required alongside the
          -- balance equality -- sum(debit)=sum(credit)=0 would otherwise
          -- false-PASS if the lines insert silently produced zero rows.
          if v_je1_id is not null and (v_result->>'was_duplicate')::boolean = false
             and v_line_count = 2 and v_sum_debit = v_sum_credit and v_sum_debit > 0 then
            v_pass := v_pass + 1;
            raise notice 'PASS (#9 post_journal_entry): balanced journal % created (% lines, debit=credit=%)', v_je1_no, v_line_count, v_sum_debit;
            insert into _15b_validation_log(message) values (format('PASS (#9 post_journal_entry): balanced journal %s created (%s lines, debit=credit=%s)', v_je1_no, v_line_count, v_sum_debit));
          else
            v_fail := v_fail + 1;
            raise notice 'FAIL (#9 post_journal_entry): unexpected result: %  (line count=%, sum debit=%, sum credit=%)', v_result, v_line_count, v_sum_debit, v_sum_credit;
            insert into _15b_validation_log(message) values (format('FAIL (#9 post_journal_entry): unexpected result: %s  (line count=%s, sum debit=%s, sum credit=%s)', v_result, v_line_count, v_sum_debit, v_sum_credit));
          end if;
        end if;
      exception when others then
        v_fail := v_fail + 1;
        raise notice 'FAIL (#9 post_journal_entry): unexpected error: %', sqlerrm;
        insert into _15b_validation_log(message) values (format('FAIL (#9 post_journal_entry): unexpected error: %s', sqlerrm));
      end;

      -- =====================================================================
      -- #11 Duplicate posting returns the existing journal (idempotency)
      -- =====================================================================
      begin
        if v_je1_id is null then
          v_skip := v_skip + 1;
          raise notice 'SKIP (#11 idempotent reposting): #9 did not produce a journal to repost';
          insert into _15b_validation_log(message) values ('SKIP (#11 idempotent reposting): #9 did not produce a journal to repost');
        else
          select post_journal_entry(jsonb_build_object(
            'company_id', v_company_a,
            'entry_date', current_date,
            'voucher_type', 'sales',
            'posting_source', 'sales',
            'reference', '__15B_VALIDATION_TEST__ INV-0001',
            'ref_table', 'invoices',
            'ref_id', v_ref_id_1,
            'created_by', v_user_a,
            'lines', jsonb_build_array(
              jsonb_build_object('account_id', v_account_cash, 'debit', 100, 'credit', 0),
              jsonb_build_object('account_id', v_account_sales, 'debit', 0, 'credit', 100)
            )
          )) into v_result2;

          select count(*) into v_count from journal_entries where company_id = v_company_a and ref_table = 'invoices' and ref_id = v_ref_id_1;

          if (v_result2->>'was_duplicate')::boolean = true
             and (v_result2->>'journal_id')::uuid = v_je1_id
             and v_count = 1 then
            v_pass := v_pass + 1;
            raise notice 'PASS (#11 idempotent reposting): repost returned the existing journal % (was_duplicate=true), still exactly 1 row for this ref', v_je1_no;
            insert into _15b_validation_log(message) values (format('PASS (#11 idempotent reposting): repost returned the existing journal %s (was_duplicate=true), still exactly 1 row for this ref', v_je1_no));
          else
            v_fail := v_fail + 1;
            raise notice 'FAIL (#11 idempotent reposting): expected was_duplicate=true and 1 row for this ref, got % (row count %)', v_result2, v_count;
            insert into _15b_validation_log(message) values (format('FAIL (#11 idempotent reposting): expected was_duplicate=true and 1 row for this ref, got %s (row count %s)', v_result2, v_count));
          end if;
        end if;
      exception when others then
        v_fail := v_fail + 1;
        raise notice 'FAIL (#11 idempotent reposting): unexpected error: %', sqlerrm;
        insert into _15b_validation_log(message) values (format('FAIL (#11 idempotent reposting): unexpected error: %s', sqlerrm));
      end;

      -- =====================================================================
      -- #10 reverse_journal_entry() creates exactly one reversing journal
      -- =====================================================================
      begin
        if v_je1_id is null then
          v_skip := v_skip + 1;
          raise notice 'SKIP (#10 reverse_journal_entry): #9 did not produce a journal to reverse';
          insert into _15b_validation_log(message) values ('SKIP (#10 reverse_journal_entry): #9 did not produce a journal to reverse');
        else
          select reverse_journal_entry(v_je1_id, '__15B_VALIDATION_TEST__ reversal') into v_result;
          v_rev_id := (v_result->>'journal_id')::uuid;

          select count(*) into v_count from journal_entries where reverses_journal_id = v_je1_id;
          select reversed_by_journal_id into v_text from journal_entries where id = v_je1_id;

          if v_rev_id is not null and v_rev_id <> v_je1_id and v_count = 1 and v_text = v_rev_id::text then
            v_pass := v_pass + 1;
            raise notice 'PASS (#10 reverse_journal_entry): exactly one reversing journal % created, original correctly linked back to it', v_result->>'journal_no';
            insert into _15b_validation_log(message) values (format('PASS (#10 reverse_journal_entry): exactly one reversing journal %s created, original correctly linked back to it', v_result->>'journal_no'));
          else
            v_fail := v_fail + 1;
            raise notice 'FAIL (#10 reverse_journal_entry): unexpected result: %  (reversing rows found=%, original.reversed_by=%)', v_result, v_count, v_text;
            insert into _15b_validation_log(message) values (format('FAIL (#10 reverse_journal_entry): unexpected result: %s  (reversing rows found=%s, original.reversed_by=%s)', v_result, v_count, v_text));
          end if;

          -- lines mirrored (debit/credit swapped)?
          select count(*) into v_count from journal_lines jl1
            join journal_lines jl2 on jl2.journal_entry_id = v_rev_id and jl2.account_id = jl1.account_id
              and jl2.debit = jl1.credit and jl2.credit = jl1.debit
            where jl1.journal_entry_id = v_je1_id;
          if v_count = 2 then
            v_pass := v_pass + 1;
            raise notice 'PASS (#10 reverse_journal_entry): both lines correctly mirrored (debit/credit swapped)';
            insert into _15b_validation_log(message) values ('PASS (#10 reverse_journal_entry): both lines correctly mirrored (debit/credit swapped)');
          else
            v_fail := v_fail + 1;
            raise notice 'FAIL (#10 reverse_journal_entry): expected 2 mirrored lines, found %', v_count;
            insert into _15b_validation_log(message) values (format('FAIL (#10 reverse_journal_entry): expected 2 mirrored lines, found %s', v_count));
          end if;
        end if;
      exception when others then
        v_fail := v_fail + 1;
        raise notice 'FAIL (#10 reverse_journal_entry): unexpected error: %', sqlerrm;
        insert into _15b_validation_log(message) values (format('FAIL (#10 reverse_journal_entry): unexpected error: %s', sqlerrm));
      end;

      -- =====================================================================
      -- #13 Journal numbering behaves as designed
      -- =====================================================================
      begin
        if v_je1_no is null then
          v_skip := v_skip + 1;
          raise notice 'SKIP (#13 journal numbering): no journal number available from #9';
          insert into _15b_validation_log(message) values ('SKIP (#13 journal numbering): no journal number available from #9');
        elsif v_je1_no ~ '^JE/\d{4}-\d{2}/\d{6}$' then
          v_pass := v_pass + 1;
          raise notice 'PASS (#13 journal numbering): % matches the designed JE/<fy>/<padded-seq> format', v_je1_no;
          insert into _15b_validation_log(message) values (format('PASS (#13 journal numbering): %s matches the designed JE/<fy>/<padded-seq> format', v_je1_no));
        else
          v_fail := v_fail + 1;
          raise notice 'FAIL (#13 journal numbering): % does not match the expected JE/<fy>/<seq> format', v_je1_no;
          insert into _15b_validation_log(message) values (format('FAIL (#13 journal numbering): %s does not match the expected JE/<fy>/<seq> format', v_je1_no));
        end if;
      exception when others then
        v_fail := v_fail + 1;
        raise notice 'FAIL (#13 journal numbering): unexpected error: %', sqlerrm;
        insert into _15b_validation_log(message) values (format('FAIL (#13 journal numbering): unexpected error: %s', sqlerrm));
      end;

      -- =====================================================================
      -- #14 Owner authorization enforced for reversal
      -- =====================================================================
      begin
        -- fresh entry for this test, so it's independent of #10's already-reversed one
        select post_journal_entry(jsonb_build_object(
          'company_id', v_company_a,
          'entry_date', current_date,
          'voucher_type', 'sales',
          'posting_source', 'sales',
          'reference', '__15B_VALIDATION_TEST__ INV-0002',
          'ref_table', 'invoices',
          'ref_id', v_ref_id_2,
          'created_by', v_user_a,
          'lines', jsonb_build_array(
            jsonb_build_object('account_id', v_account_cash, 'debit', 50, 'credit', 0),
            jsonb_build_object('account_id', v_account_sales, 'debit', 0, 'credit', 50)
          )
        )) into v_result;
        v_je2_id := (v_result->>'journal_id')::uuid;

        perform set_config('request.jwt.claims', json_build_object('sub', v_user_a_cashier, 'role', 'authenticated')::text, true);
        perform set_config('request.jwt.claim.sub', v_user_a_cashier::text, true);
        execute 'set local role authenticated';

        begin
          select reverse_journal_entry(v_je2_id, '__15B_VALIDATION_TEST__ cashier attempt') into v_result;
          v_fail := v_fail + 1;
          raise notice 'FAIL (#14 owner authorization): a non-owner (cashier) reversal unexpectedly SUCCEEDED: %', v_result;
          insert into _15b_validation_log(message) values (format('FAIL (#14 owner authorization): a non-owner (cashier) reversal unexpectedly SUCCEEDED: %s', v_result));
        exception when others then
          if sqlerrm ilike '%owner%manager%' then
            v_pass := v_pass + 1;
            raise notice 'PASS (#14 owner authorization): non-owner reversal correctly rejected: %', sqlerrm;
            insert into _15b_validation_log(message) values (format('PASS (#14 owner authorization): non-owner reversal correctly rejected: %s', sqlerrm));
          else
            v_fail := v_fail + 1;
            raise notice 'FAIL (#14 owner authorization): rejected, but with an unexpected error: %', sqlerrm;
            insert into _15b_validation_log(message) values (format('FAIL (#14 owner authorization): rejected, but with an unexpected error: %s', sqlerrm));
          end if;
        end;

        execute 'reset role';
      exception when others then
        v_fail := v_fail + 1;
        raise notice 'FAIL (#14 owner authorization): unexpected error setting up the test: %', sqlerrm;
        insert into _15b_validation_log(message) values (format('FAIL (#14 owner authorization): unexpected error setting up the test: %s', sqlerrm));
        begin execute 'reset role'; exception when others then null; end;
      end;

      -- =====================================================================
      -- #15 Cross-company isolation
      -- =====================================================================
      begin
        perform set_config('request.jwt.claims', json_build_object('sub', v_user_b, 'role', 'authenticated')::text, true);
        perform set_config('request.jwt.claim.sub', v_user_b::text, true);
        execute 'set local role authenticated';

        begin
          select create_company('__15B_VALIDATION_TEST__ Company B', 'Test Firm B', false) into v_company_b;
        exception when others then
          raise notice 'NOTE (setup): create_company() for Company B raised: %', sqlerrm;
          insert into _15b_validation_log(message) values (format('NOTE (setup): create_company() for Company B raised: %s', sqlerrm));
        end;

        if v_company_b is null then
          v_skip := v_skip + 1;
          raise notice 'SKIP (#15 cross-company isolation): Company B could not be created';
          insert into _15b_validation_log(message) values ('SKIP (#15 cross-company isolation): Company B could not be created');
        else
          -- B reading A's data must return zero rows, silently (not an error)
          select count(*) into v_count from journal_entries where company_id = v_company_a;
          select count(*) into v_count2 from accounts where company_id = v_company_a;

          if v_count = 0 and v_count2 = 0 then
            v_pass := v_pass + 1;
            raise notice 'PASS (#15 cross-company isolation): Company B''s session sees zero rows of Company A''s journal_entries/accounts';
            insert into _15b_validation_log(message) values ('PASS (#15 cross-company isolation): Company B''s session sees zero rows of Company A''s journal_entries/accounts');
          else
            v_fail := v_fail + 1;
            raise notice 'FAIL (#15 cross-company isolation): Company B''s session saw % journal_entries and % accounts rows belonging to Company A -- RLS leak', v_count, v_count2;
            insert into _15b_validation_log(message) values (format('FAIL (#15 cross-company isolation): Company B''s session saw %s journal_entries and %s accounts rows belonging to Company A -- RLS leak', v_count, v_count2));
          end if;

          -- B attempting to reverse A's journal via the RPC must be rejected
          if v_je2_id is not null then
            begin
              select reverse_journal_entry(v_je2_id, '__15B_VALIDATION_TEST__ cross-company attempt') into v_result;
              v_fail := v_fail + 1;
              raise notice 'FAIL (#15 cross-company isolation): Company B unexpectedly reversed Company A''s journal entry: %', v_result;
              insert into _15b_validation_log(message) values (format('FAIL (#15 cross-company isolation): Company B unexpectedly reversed Company A''s journal entry: %s', v_result));
            exception when others then
              v_pass := v_pass + 1;
              raise notice 'PASS (#15 cross-company isolation): Company B''s attempt to reverse Company A''s journal was rejected: %', sqlerrm;
              insert into _15b_validation_log(message) values (format('PASS (#15 cross-company isolation): Company B''s attempt to reverse Company A''s journal was rejected: %s', sqlerrm));
            end;
          end if;
        end if;

        execute 'reset role';
      exception when others then
        v_fail := v_fail + 1;
        raise notice 'FAIL (#15 cross-company isolation): unexpected error: %', sqlerrm;
        insert into _15b_validation_log(message) values (format('FAIL (#15 cross-company isolation): unexpected error: %s', sqlerrm));
        begin execute 'reset role'; exception when others then null; end;
      end;

    end if; -- v_company_a is not null
  end if; -- v_auth_works

  -- =====================================================================
  -- Summary
  -- =====================================================================
  raise notice '=====================================================================';
  insert into _15b_validation_log(message) values ('=====================================================================');
  raise notice 'RESULT: % PASS, % FAIL, % SKIP', v_pass, v_fail, v_skip;
  insert into _15b_validation_log(message) values (format('RESULT: %s PASS, %s FAIL, %s SKIP', v_pass, v_fail, v_skip));
  if v_fail = 0 and v_pass > 0 then
    raise notice 'ALL CHECKS PASSED';
    insert into _15b_validation_log(message) values ('ALL CHECKS PASSED');
  elsif v_fail > 0 then
    raise notice 'FAILURES PRESENT -- see FAIL lines above for exact detail';
    insert into _15b_validation_log(message) values ('FAILURES PRESENT -- see FAIL lines above for exact detail');
  end if;
  raise notice 'Finished at % -- rolling back now, no data from this run persists.', clock_timestamp();
  insert into _15b_validation_log(message) values (format('Finished at %s -- rolling back now, no data from this run persists.', clock_timestamp()));
  raise notice '=====================================================================';
  insert into _15b_validation_log(message) values ('=====================================================================');
end $$;

-- This is the statement that actually shows up in the Supabase SQL
-- Editor's results grid -- everything above only ever went to RAISE
-- NOTICE, which is why the editor reported "Success. No rows returned."
select seq, message from _15b_validation_log order by seq;

rollback;
