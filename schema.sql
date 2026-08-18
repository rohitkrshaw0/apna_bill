-- =====================================================================
-- ApnaBill schema v4  —  Company > Firm hierarchy
-- Run this FIRST in the Supabase SQL Editor, replacing v3.
-- Then: sale_rpc.sql, then manufacturing_rpc.sql
--
-- MODEL:
--   Companies         (top level; a shop as a whole)
--     └── Firms       (billing entities inside a company; usually 1, up to 3)
--
--   Shared per COMPANY (belong to the shop as a whole):
--     parties, items, batches, stock_ledger, payment_types,
--     custom fields, loyalty, audit log
--
--   Per FIRM (legal / tax identity):
--     invoices, invoice_lines, payments, purchases, purchase_lines,
--     manufacturing_runs, manufacturing_lines, invoice_prefixes,
--     print_settings, invoice_attachments
--
-- Access: users are members of a COMPANY. Within a company they can bill
-- under any firm (there's a chosen "default firm" for quick entry).
-- =====================================================================

-- ---------- Drop the old v3 shape (safe: no real data yet) ----------
drop function if exists is_member_of(uuid)  cascade;
drop function if exists is_owner_of(uuid)   cascade;
drop function if exists current_fy(date, int) cascade;
drop function if exists create_business(text, boolean, text, text, text, text, text, int) cascade;
drop function if exists next_invoice_number(uuid, text, date) cascade;
drop function if exists create_sale(jsonb) cascade;
drop function if exists create_purchase(jsonb) cascade;
drop function if exists create_manufacturing(jsonb) cascade;

-- Milestone 15B review finding: the six accounting tables below were
-- originally missing from this drop list, which every other table in
-- this file relies on for the "run this file again, it rebuilds cleanly"
-- guarantee the header comment promises. Without them, re-running this
-- script against a database that already has the Milestone 15B schema
-- applied would fail on `create table accounts` with "relation already
-- exists" instead of rebuilding like everything else. Listed child-before-
-- parent, matching this list's own existing convention (cascade makes
-- the order non-load-bearing, but readability isn't).
-- Milestone 15E: the ledger view depends on accounts/journal_entries/
-- journal_lines, all three already covered by the cascade below, so this
-- explicit drop is redundant in practice -- kept anyway, for the same
-- self-documenting reason the six tables above were added explicitly
-- rather than left to rely on cascade alone. Must be dropped before the
-- tables it depends on, so it comes first, not inside that cascade list
-- (drop view and drop table are different statements).
drop view if exists v_journal_ledger_lines;
drop table if exists journal_lines, journal_entries, journal_number_counters,
  accounting_settings, fiscal_periods, accounts,
  invoice_attachments, audit_log, print_settings, loyalty_transactions,
  manufacturing_lines, manufacturing_runs, purchase_lines, purchases,
  payments, invoice_lines, invoices, payment_types, invoice_prefixes,
  stock_ledger, batches, item_custom_field_values, item_custom_field_defs,
  items, parties, business_members, businesses,
  firms, company_members, companies
  cascade;

-- ---------- Extensions ----------
create extension if not exists "pgcrypto";

-- =====================================================================
-- 1. companies  (top level — a shop as a whole)
-- =====================================================================
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  fy_start_month int not null default 4,           -- India: April
  loyalty_enabled boolean not null default false,
  loyalty_earn_per_100 numeric(8,3) not null default 0,
  loyalty_redeem_value numeric(8,3) not null default 0,
  loyalty_min_redeem_points int not null default 0,
  is_active boolean not null default true,          -- soft delete flag
  created_by uuid not null,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- 2. company_members  (which users can access which company)
-- =====================================================================
create table company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('owner','manager','cashier','viewer')),
  created_at timestamptz not null default now(),
  unique(company_id, user_id)
);
create index idx_cm_user on company_members(user_id);
create index idx_cm_company on company_members(company_id);

-- =====================================================================
-- 3. firms  (billing entities inside a company)
-- =====================================================================
create table firms (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,                              -- display / legal name
  legal_name text,
  is_gst_registered boolean not null default false,
  gstin text,
  state_code text,
  address text,
  phone text,
  email text,
  is_default boolean not null default false,       -- pick this at sale time
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index idx_firms_company on firms(company_id);
-- only one default firm per company
create unique index idx_firms_one_default on firms(company_id) where is_default;

-- =====================================================================
-- 4. parties  (customers + suppliers — company-scoped)
-- =====================================================================
create table parties (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  gstin text,
  address text,
  state_code text,
  is_customer boolean not null default true,
  is_supplier boolean not null default false,
  opening_balance numeric(14,2) not null default 0,
  current_balance numeric(14,2) not null default 0,
  loyalty_points int not null default 0,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index idx_parties_company on parties(company_id);
create index idx_parties_phone on parties(company_id, phone);
create index idx_parties_name on parties(company_id, lower(name));

-- =====================================================================
-- 5. items  (goods + services — company-scoped)
-- =====================================================================
create table items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  code text,
  name text not null,
  kind text not null default 'goods' check (kind in ('goods','service')),
  hsn_sac text,
  unit text not null default 'PCS',
  gst_rate numeric(5,2) not null default 0,
  cess_rate numeric(5,2) not null default 0,
  is_price_inclusive boolean not null default false,
  default_retail_price numeric(14,2) not null default 0,
  default_wholesale_price numeric(14,2) not null default 0,
  default_purchase_price numeric(14,2) not null default 0,
  track_stock boolean not null default true,
  track_batches boolean not null default true,
  low_stock_threshold numeric(14,3) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index idx_items_company on items(company_id);
create index idx_items_name on items(company_id, lower(name));
create unique index idx_items_code on items(company_id, code);

-- =====================================================================
-- 6. item_custom_field_defs   (company-scoped)
-- =====================================================================
create table item_custom_field_defs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  label text not null,
  field_type text not null default 'text' check (field_type in ('text','number','date','select')),
  options jsonb,
  sort_order int not null default 0,
  is_active boolean not null default true,
  unique(company_id, label)
);

-- =====================================================================
-- 7. item_custom_field_values  (company-scoped)
-- =====================================================================
create table item_custom_field_values (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  field_id uuid not null references item_custom_field_defs(id) on delete cascade,
  value text,
  unique(item_id, field_id)
);
create index idx_icfv_item on item_custom_field_values(item_id);

-- =====================================================================
-- 8. batches  (stock is company-wide; any firm draws from same pool)
-- =====================================================================
create table batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  batch_no text,
  shade text,
  size text,
  mrp numeric(14,2),
  cost_price numeric(14,2) not null default 0,
  retail_price numeric(14,2),
  wholesale_price numeric(14,2),
  qty_on_hand numeric(14,3) not null default 0,
  purchase_id uuid,
  created_at timestamptz not null default now()
);
create index idx_batches_item on batches(item_id);
create index idx_batches_company on batches(company_id);
create index idx_batches_active on batches(company_id, item_id) where qty_on_hand > 0;

-- =====================================================================
-- 9. stock_ledger  (company-scoped; every stock movement)
-- =====================================================================
create table stock_ledger (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  batch_id uuid references batches(id) on delete set null,
  txn_date timestamptz not null default now(),
  txn_type text not null check (txn_type in
    ('purchase','sale','sale_return','purchase_return','mfg_consume','mfg_produce','adjustment','opening')),
  ref_table text,
  ref_id uuid,
  qty_in numeric(14,3) not null default 0,
  qty_out numeric(14,3) not null default 0,
  unit_cost numeric(14,2),
  notes text
);
create index idx_ledger_item on stock_ledger(item_id, txn_date);
create index idx_ledger_company on stock_ledger(company_id, txn_date);
create index idx_ledger_ref on stock_ledger(ref_table, ref_id);

-- =====================================================================
-- 10. payment_types  (company-scoped)
-- =====================================================================
create table payment_types (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  sort_order int not null default 0,
  unique(company_id, name)
);

-- =====================================================================
-- 11. invoice_prefixes  (firm-scoped — each firm has its own book)
-- =====================================================================
create table invoice_prefixes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  firm_id uuid not null references firms(id) on delete cascade,
  doc_type text not null check (doc_type in ('sale','purchase','sale_return','purchase_return','quotation','mfg')),
  fy_label text not null,
  prefix text not null default '',
  next_seq int not null default 1,
  pad_width int not null default 4,
  unique(firm_id, doc_type, fy_label)
);

-- =====================================================================
-- 12. invoices  (firm-scoped SALES)
-- =====================================================================
create table invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  firm_id uuid not null references firms(id) on delete restrict,
  invoice_no text not null,
  fy_label text not null,
  doc_type text not null default 'sale' check (doc_type in ('sale','sale_return','quotation')),
  invoice_date date not null default current_date,
  party_id uuid references parties(id) on delete restrict,
  party_name_snapshot text,
  party_phone_snapshot text,
  party_gstin_snapshot text,
  party_state_code_snapshot text,
  is_credit boolean not null default false,
  is_interstate boolean not null default false,
  subtotal numeric(14,2) not null default 0,
  discount_total numeric(14,2) not null default 0,
  cgst_total numeric(14,2) not null default 0,
  sgst_total numeric(14,2) not null default 0,
  igst_total numeric(14,2) not null default 0,
  cess_total numeric(14,2) not null default 0,
  round_off numeric(6,2) not null default 0,
  grand_total numeric(14,2) not null default 0,
  amount_paid numeric(14,2) not null default 0,
  amount_due numeric(14,2) not null default 0,
  loyalty_earned int not null default 0,
  loyalty_redeemed int not null default 0,
  loyalty_discount numeric(14,2) not null default 0,
  notes text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique(firm_id, doc_type, fy_label, invoice_no)
);
create index idx_invoices_company_date on invoices(company_id, invoice_date desc);
create index idx_invoices_firm_date on invoices(firm_id, invoice_date desc);
create index idx_invoices_party on invoices(party_id);

-- =====================================================================
-- 13. invoice_lines
-- =====================================================================
create table invoice_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  invoice_id uuid not null references invoices(id) on delete cascade,
  line_no int not null,
  item_id uuid references items(id) on delete restrict,
  batch_id uuid references batches(id) on delete set null,
  item_name_snapshot text not null,
  hsn_sac text,
  unit text,
  qty_paid numeric(14,3) not null default 0,
  qty_free numeric(14,3) not null default 0,
  rate numeric(14,2) not null default 0,
  is_inclusive boolean not null default false,
  discount_pct numeric(6,3) not null default 0,
  discount_amt numeric(14,2) not null default 0,
  taxable_value numeric(14,2) not null default 0,
  gst_rate numeric(5,2) not null default 0,
  cgst_amt numeric(14,2) not null default 0,
  sgst_amt numeric(14,2) not null default 0,
  igst_amt numeric(14,2) not null default 0,
  cess_rate numeric(5,2) not null default 0,
  cess_amt numeric(14,2) not null default 0,
  line_total numeric(14,2) not null default 0
);
create index idx_lines_invoice on invoice_lines(invoice_id);
create index idx_lines_item on invoice_lines(item_id);

-- =====================================================================
-- 14. payments
-- =====================================================================
create table payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  firm_id uuid references firms(id) on delete restrict,
  invoice_id uuid references invoices(id) on delete cascade,
  party_id uuid references parties(id) on delete restrict,
  payment_date date not null default current_date,
  payment_type_id uuid references payment_types(id) on delete restrict,
  amount numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  reference text,
  notes text,
  created_by uuid not null,
  created_at timestamptz not null default now()
);
create index idx_payments_invoice on payments(invoice_id);
create index idx_payments_party on payments(party_id);
create index idx_payments_company_date on payments(company_id, payment_date desc);

-- =====================================================================
-- 15. purchases
-- =====================================================================
create table purchases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  firm_id uuid not null references firms(id) on delete restrict,
  bill_no text not null,
  bill_date date not null default current_date,
  fy_label text not null,
  supplier_id uuid references parties(id) on delete restrict,
  supplier_gstin_snapshot text,
  supplier_state_code_snapshot text,
  is_interstate boolean not null default false,
  subtotal numeric(14,2) not null default 0,
  discount_total numeric(14,2) not null default 0,
  cgst_total numeric(14,2) not null default 0,
  sgst_total numeric(14,2) not null default 0,
  igst_total numeric(14,2) not null default 0,
  cess_total numeric(14,2) not null default 0,
  round_off numeric(6,2) not null default 0,
  grand_total numeric(14,2) not null default 0,
  amount_paid numeric(14,2) not null default 0,
  amount_due numeric(14,2) not null default 0,
  notes text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique(firm_id, supplier_id, bill_no)
);
create index idx_purchases_company_date on purchases(company_id, bill_date desc);
create index idx_purchases_supplier on purchases(supplier_id);

-- =====================================================================
-- 16. purchase_lines
-- =====================================================================
create table purchase_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  purchase_id uuid not null references purchases(id) on delete cascade,
  line_no int not null,
  item_id uuid references items(id) on delete restrict,
  item_name_snapshot text not null,
  hsn_sac text,
  unit text,
  qty numeric(14,3) not null default 0,
  qty_free numeric(14,3) not null default 0,
  rate numeric(14,2) not null default 0,
  is_inclusive boolean not null default false,
  discount_pct numeric(6,3) not null default 0,
  discount_amt numeric(14,2) not null default 0,
  taxable_value numeric(14,2) not null default 0,
  gst_rate numeric(5,2) not null default 0,
  cgst_amt numeric(14,2) not null default 0,
  sgst_amt numeric(14,2) not null default 0,
  igst_amt numeric(14,2) not null default 0,
  cess_rate numeric(5,2) not null default 0,
  cess_amt numeric(14,2) not null default 0,
  line_total numeric(14,2) not null default 0,
  batch_no text,
  shade text,
  size text,
  mrp numeric(14,2),
  batch_id uuid references batches(id) on delete set null
);
create index idx_pl_purchase on purchase_lines(purchase_id);
create index idx_pl_item on purchase_lines(item_id);

-- =====================================================================
-- 17. manufacturing_runs
-- =====================================================================
create table manufacturing_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  firm_id uuid not null references firms(id) on delete restrict,
  run_no text not null,
  run_date date not null default current_date,
  fy_label text not null,
  produced_item_id uuid not null references items(id) on delete restrict,
  produced_qty numeric(14,3) not null default 0,
  overhead_cost numeric(14,2) not null default 0,
  total_material_cost numeric(14,2) not null default 0,
  total_cost numeric(14,2) not null default 0,
  cost_per_unit numeric(14,2) not null default 0,
  produced_batch_id uuid references batches(id) on delete set null,
  notes text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique(firm_id, fy_label, run_no)
);
create index idx_mfg_company_date on manufacturing_runs(company_id, run_date desc);

-- =====================================================================
-- 18. manufacturing_lines
-- =====================================================================
create table manufacturing_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  run_id uuid not null references manufacturing_runs(id) on delete cascade,
  direction text not null check (direction in ('consume','produce')),
  item_id uuid not null references items(id) on delete restrict,
  batch_id uuid references batches(id) on delete set null,
  qty numeric(14,3) not null default 0,
  unit_cost numeric(14,2) not null default 0,
  line_cost numeric(14,2) not null default 0
);
create index idx_mfg_lines_run on manufacturing_lines(run_id);

-- =====================================================================
-- 19. loyalty_transactions  (company-scoped — points follow the customer)
-- =====================================================================
create table loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  party_id uuid not null references parties(id) on delete cascade,
  invoice_id uuid references invoices(id) on delete set null,
  txn_date timestamptz not null default now(),
  direction text not null check (direction in ('earn','redeem','adjust')),
  points int not null default 0,
  balance_after int not null default 0,
  notes text
);
create index idx_loyalty_party on loyalty_transactions(party_id);

-- =====================================================================
-- 20. print_settings  (firm-scoped — each firm has its own letterhead)
-- =====================================================================
create table print_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  firm_id uuid not null references firms(id) on delete cascade,
  printer_type text not null check (printer_type in ('thermal_58','thermal_80','a5','a4')),
  header_html text,
  footer_html text,
  show_logo boolean not null default true,
  logo_url text,
  extra_json jsonb,
  unique(firm_id, printer_type)
);

-- =====================================================================
-- 21. audit_log
-- =====================================================================
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  actor_user_id uuid,
  action text not null,
  table_name text,
  row_id uuid,
  before_json jsonb,
  after_json jsonb,
  notes text,
  created_at timestamptz not null default now()
);
create index idx_audit_company_time on audit_log(company_id, created_at desc);

-- =====================================================================
-- 22. invoice_attachments
-- =====================================================================
create table invoice_attachments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  invoice_id uuid references invoices(id) on delete cascade,
  purchase_id uuid references purchases(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  content_type text,
  size_bytes bigint,
  uploaded_by uuid,
  created_at timestamptz not null default now(),
  check ((invoice_id is not null) <> (purchase_id is not null))
);

-- =====================================================================
-- Accounting Platform (Milestone 15B — Journal Engine)
-- Company-scoped, mirroring every other master/transaction table above.
-- Persisted counterpart of js/services/accounting/**'s in-memory
-- contracts (Milestone 15A). See docs/architecture/accounting-platform-
-- architecture.md and the Milestone 15B design review for the reasoning
-- behind every constraint below -- nothing here is arbitrary.
-- =====================================================================

create extension if not exists "btree_gist";

-- =====================================================================
-- 23. accounts  (Chart of Accounts)
-- =====================================================================
create table accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  code text not null,
  name text not null,
  category text not null,                            -- open catalog (ADR-0010) -- no check
  type text not null,                                 -- open catalog (ADR-0010) -- no check
  normal_balance text not null check (normal_balance in ('debit','credit')),
  parent_id uuid references accounts(id) on delete restrict,
  is_reserved boolean not null default false,
  status text not null default 'active' check (status in ('active','inactive')),
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(company_id, code)
);
create index idx_accounts_company on accounts(company_id);
create index idx_accounts_parent on accounts(parent_id);

-- =====================================================================
-- 24. fiscal_periods
-- =====================================================================
create table fiscal_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  fiscal_year text not null,
  label text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'open' check (status in ('open','closed','locked')),
  metadata jsonb not null default '{}'::jsonb,
  check (start_date <= end_date)
);
create index idx_fiscal_periods_company on fiscal_periods(company_id, start_date);
-- No two periods in the same company may overlap, database-enforced (the JS
-- fiscalPeriodService.register() applies the same rule in memory; this is
-- the persisted twin, not a duplicate of intent).
alter table fiscal_periods add constraint fiscal_periods_no_overlap
  exclude using gist (company_id with =, daterange(start_date, end_date, '[]') with &&);

-- =====================================================================
-- 25. journal_entries  (header)
-- =====================================================================
create table journal_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  fiscal_period_id uuid not null references fiscal_periods(id) on delete restrict,
  journal_no text not null,
  fy_label text not null,
  entry_date date not null default current_date,
  voucher_type text not null,
  posting_source text not null,
  reference text,
  narration text,
  -- Idempotency key (see the Milestone 15B design review's "Idempotency"
  -- section): the business document that caused this posting, mirroring
  -- stock_ledger's own ref_table/ref_id. NULL for manual journals and
  -- reversals, which have no source document.
  ref_table text,
  ref_id uuid,
  reverses_journal_id uuid references journal_entries(id),
  reversed_by_journal_id uuid references journal_entries(id),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique(company_id, fy_label, journal_no),
  -- Milestone 15B review finding: idx_je_ref below only enforces the
  -- idempotency guarantee when BOTH columns are set (its WHERE clause
  -- checks ref_id only) -- a row with ref_id set but ref_table null
  -- would silently escape the uniqueness check, since NULL <> NULL in a
  -- unique index. This constraint makes that combination impossible to
  -- write in the first place, closing the gap at the source rather than
  -- widening the index predicate.
  check ((ref_table is null) = (ref_id is null))
);
create index idx_je_company_date on journal_entries(company_id, entry_date desc);
create index idx_je_fiscal_period on journal_entries(fiscal_period_id);
-- One journal entry per source document per company -- the idempotency guard.
create unique index idx_je_ref on journal_entries(company_id, ref_table, ref_id) where ref_id is not null;
-- A journal entry may be reversed at most once.
create unique index idx_je_reverses on journal_entries(reverses_journal_id) where reverses_journal_id is not null;

-- =====================================================================
-- 26. journal_lines  (detail)
-- =====================================================================
create table journal_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  journal_entry_id uuid not null references journal_entries(id) on delete cascade,
  line_no int not null,
  account_id uuid not null references accounts(id) on delete restrict,
  debit numeric(14,2) not null default 0,
  credit numeric(14,2) not null default 0,
  narration text,
  metadata jsonb not null default '{}'::jsonb,
  check ((debit = 0) <> (credit = 0)),
  check (debit >= 0 and credit >= 0)
);
create index idx_jl_entry on journal_lines(journal_entry_id);
create index idx_jl_account on journal_lines(account_id);

-- =====================================================================
-- 27. accounting_settings  (per-company account-role mapping)
-- The Account Resolution Service's only source of configuration -- posting
-- providers never read this table directly, they call the resolver.
-- =====================================================================
create table accounting_settings (
  company_id uuid primary key references companies(id) on delete cascade,
  account_map jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- =====================================================================
-- 28. journal_number_counters  (one unified sequence per company per FY --
-- design decision #4. Locked and incremented by next_journal_number() in
-- accounting_rpc.sql, the same "lock the counter row" idiom
-- next_invoice_number() already uses on invoice_prefixes, simplified: one
-- row per (company, fy) rather than per (firm, doc_type, fy), because a
-- journal register is one day-book, not a per-document-type series.
-- =====================================================================
create table journal_number_counters (
  company_id uuid not null references companies(id) on delete cascade,
  fy_label text not null,
  prefix text not null default 'JE/',
  next_seq int not null default 1,
  pad_width int not null default 6,
  primary key (company_id, fy_label)
);

-- =====================================================================
-- 29. v_journal_ledger_lines  (Milestone 15E -- General Ledger Platform)
-- The canonical per-account running-balance read projection: every future
-- ledger-derived screen (General Ledger 15E, Trial Balance 15F, P&L 15G,
-- Balance Sheet 15H) composes on this view rather than re-deriving running
-- balance independently -- see ADR-0012. Additive, read-only, non-
-- materialized: a plain view is inlined into the querying statement by the
-- planner (unlike a plpgsql function body, which is an optimization
-- barrier), so server-side filtering/pagination on top of it still runs as
-- one indexed query, not "compute everything then filter in application
-- code." `security_invoker = true` below is not optional decoration: a
-- Postgres view defaults to running its underlying query AS ITS OWNER,
-- not as the querying role. On Supabase, an object created through the
-- SQL Editor is owned by `postgres`, which has BYPASSRLS -- an anon (or
-- any authenticated, non-member) request against a security_invoker-less
-- version of this exact view was live-verified, during this milestone's
-- own validation, to silently return every company's ledger lines
-- regardless of RLS on the base tables. `security_invoker = true` makes
-- the view execute with the INVOKER's own privileges instead, so
-- je_select/jl_select/accounts_select are re-evaluated for the actual
-- caller on every query against this view -- the same as querying the
-- base tables directly. No RLS policy is declared here because a view
-- has none of its own to declare; correctness now depends on this
-- clause, not on "it's just a view" alone.
--
-- Deliberately excludes anything that isn't accounting data belonging to
-- journal_lines/journal_entries/accounts themselves: no customer/supplier
-- name, no inventory metadata, no GST presentation, no UI formatting/
-- labels. A caller that wants the selected account's own name/code/
-- category/type looks it up separately against `accounts` (RLS-scoped the
-- same way) -- this view is about ledger LINES, not the account header,
-- and denormalizing the same account's name onto every one of its own
-- rows would add nothing but repetition.
--
-- running_balance is a window-function running total over debit-credit
-- (or credit-debit, per the account's own normal_balance -- ADR-0010 is
-- the single source of truth for that direction, never re-derived here)
-- ordered by (entry_date, journal_no, line_no) and partitioned by
-- (company_id, account_id), so it is correct per-account, per-company,
-- without a cross-account or cross-company leak, and without any cached
-- or persisted balance column anywhere.
-- =====================================================================
create view v_journal_ledger_lines with (security_invoker = true) as
select
  jl.id,
  jl.company_id,
  jl.account_id,
  jl.journal_entry_id,
  jl.line_no,
  jl.debit,
  jl.credit,
  jl.narration as line_narration,
  je.journal_no,
  je.fy_label,
  je.entry_date,
  je.voucher_type,
  je.posting_source,
  je.reference,
  je.narration as entry_narration,
  je.reverses_journal_id,
  je.reversed_by_journal_id,
  je.created_by,
  je.created_at,
  a.normal_balance,
  sum(
    case when a.normal_balance = 'debit' then jl.debit - jl.credit
         else jl.credit - jl.debit end
  ) over (
    partition by jl.company_id, jl.account_id
    order by je.entry_date, je.journal_no, jl.line_no
    rows between unbounded preceding and current row
  ) as running_balance
from journal_lines jl
join journal_entries je on je.id = jl.journal_entry_id
join accounts a on a.id = jl.account_id;

-- =====================================================================
-- Helper functions (SECURITY DEFINER for RLS)
-- =====================================================================

create or replace function is_member_of_company(_company_id uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from company_members
    where company_id = _company_id and user_id = auth.uid()
  );
$$;

create or replace function is_owner_of_company(_company_id uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from company_members
    where company_id = _company_id
      and user_id = auth.uid()
      and role in ('owner','manager')
  );
$$;

create or replace function current_fy(_dt date, _fy_start_month int)
returns text language plpgsql immutable as $$
declare y int; m int; start_y int;
begin
  y := extract(year from _dt)::int;
  m := extract(month from _dt)::int;
  if m >= _fy_start_month then start_y := y; else start_y := y - 1; end if;
  return start_y::text || '-' || lpad(((start_y + 1) % 100)::text, 2, '0');
end;
$$;

-- =====================================================================
-- bootstrap_accounting_defaults: minimum viable Chart of Accounts +
-- account-role mapping for a brand-new company (Milestone 15B Blocker 2).
--
-- Without this, the Accounting Platform's account-role catalog
-- (js/services/accounting/resolution/accountResolutionContract.js's
-- ACCOUNT_ROLES) has nothing to resolve against, and every first posting
-- attempt for a new company fails with ACCOUNT_RESOLUTION_FAILED. This
-- is the minimum fix: one flat account per role Milestone 15B's three
-- posting providers (Sales/Purchase/Manufacturing) actually use -- no
-- hierarchy, no region/GST-specific template, no customization UI.
-- accounts.is_reserved is false throughout: this is a starting chart a
-- company can rename, recode, or replace via accounting_settings later,
-- not a locked-in structure.
--
-- Idempotent: every insert is ON CONFLICT DO NOTHING, and an existing
-- accounting_settings row is never overwritten. Safe to call more than
-- once for the same company (it will simply do nothing on a repeat
-- call), though create_company() below is its only caller today.
-- =====================================================================
create or replace function bootstrap_accounting_defaults(_company_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  accounts_def jsonb := '[
    {"code":"1000","name":"Cash",                 "category":"cash",             "type":"cash",      "normal_balance":"debit",  "role":"cashAccount"},
    {"code":"1010","name":"Accounts Receivable",   "category":"receivable",       "type":"customer",  "normal_balance":"debit",  "role":"accountsReceivableAccount"},
    {"code":"1020","name":"Inventory",             "category":"currentAssets",    "type":"inventory", "normal_balance":"debit",  "role":"inventoryAccount"},
    {"code":"1900","name":"Input CGST",            "category":"gst",              "type":"tax",       "normal_balance":"debit",  "role":"inputCgstAccount"},
    {"code":"1901","name":"Input SGST",            "category":"gst",              "type":"tax",       "normal_balance":"debit",  "role":"inputSgstAccount"},
    {"code":"1902","name":"Input IGST",            "category":"gst",              "type":"tax",       "normal_balance":"debit",  "role":"inputIgstAccount"},
    {"code":"1903","name":"Input Cess",            "category":"gst",              "type":"tax",       "normal_balance":"debit",  "role":"inputCessAccount"},
    {"code":"2000","name":"Accounts Payable",      "category":"payable",          "type":"supplier",  "normal_balance":"credit", "role":"accountsPayableAccount"},
    {"code":"2900","name":"Output CGST",           "category":"gst",              "type":"tax",       "normal_balance":"credit", "role":"outputCgstAccount"},
    {"code":"2901","name":"Output SGST",           "category":"gst",              "type":"tax",       "normal_balance":"credit", "role":"outputSgstAccount"},
    {"code":"2902","name":"Output IGST",           "category":"gst",              "type":"tax",       "normal_balance":"credit", "role":"outputIgstAccount"},
    {"code":"2903","name":"Output Cess",           "category":"gst",              "type":"tax",       "normal_balance":"credit", "role":"outputCessAccount"},
    {"code":"4000","name":"Sales",                 "category":"income",           "type":"income",    "normal_balance":"credit", "role":"salesAccount"},
    {"code":"5000","name":"Purchases",             "category":"directExpenses",   "type":"expense",   "normal_balance":"debit",  "role":"purchaseAccount"},
    {"code":"5900","name":"Manufacturing Overhead","category":"indirectExpenses", "type":"expense",   "normal_balance":"debit",  "role":"manufacturingOverheadAccount"},
    {"code":"9000","name":"Rounding Off",          "category":"indirectExpenses", "type":"adjustment","normal_balance":"debit",  "role":"roundingAccount"}
  ]'::jsonb;
  acc jsonb;
  new_account_id uuid;
  role_map jsonb := '{}'::jsonb;
begin
  if not is_member_of_company(_company_id) then
    raise exception 'not a member of company %', _company_id;
  end if;

  for acc in select * from jsonb_array_elements(accounts_def) loop
    new_account_id := null;

    insert into accounts(company_id, code, name, category, type, normal_balance, is_reserved, status)
      values (_company_id, acc->>'code', acc->>'name', acc->>'category', acc->>'type', acc->>'normal_balance', false, 'active')
      on conflict (company_id, code) do nothing
      returning id into new_account_id;

    if new_account_id is null then
      select id into new_account_id from accounts where company_id = _company_id and code = acc->>'code';
    end if;

    role_map := role_map || jsonb_build_object(acc->>'role', new_account_id);
  end loop;

  insert into accounting_settings(company_id, account_map)
    values (_company_id, role_map)
    on conflict (company_id) do nothing;
end;
$$;

-- =====================================================================
-- create_company: atomically create company + owner membership +
-- first firm + default payment types + invoice prefixes for this FY
-- =====================================================================
create or replace function create_company(
  _name text,
  _firm_name text,
  _is_gst boolean,
  _gstin text default null,
  _state_code text default null,
  _address text default null,
  _phone text default null,
  _email text default null,
  _fy_start_month int default 4
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  new_company uuid;
  new_firm uuid;
  fy text;
  fy_start_year int;
  fy_start_date date;
  fy_end_date date;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if coalesce(trim(_name), '') = '' then raise exception 'company name required'; end if;

  insert into companies(name, fy_start_month, created_by)
    values (_name, coalesce(_fy_start_month, 4), auth.uid())
    returning id into new_company;

  insert into company_members(company_id, user_id, role)
    values (new_company, auth.uid(), 'owner');

  insert into firms(
    company_id, name, is_gst_registered, gstin, state_code, address, phone, email,
    is_default, sort_order
  ) values (
    new_company,
    coalesce(nullif(trim(_firm_name), ''), _name),
    _is_gst, _gstin, _state_code, _address, _phone, _email,
    true, 1
  ) returning id into new_firm;

  insert into payment_types(company_id, name, sort_order) values
    (new_company, 'Cash', 1),
    (new_company, 'UPI', 2),
    (new_company, 'Card', 3),
    (new_company, 'Bank', 4),
    (new_company, 'Cheque', 5);

  fy := current_fy(current_date, coalesce(_fy_start_month, 4));
  insert into invoice_prefixes(company_id, firm_id, doc_type, fy_label, prefix, next_seq, pad_width) values
    (new_company, new_firm, 'sale', fy, 'INV/', 1, 4),
    (new_company, new_firm, 'purchase', fy, 'PUR/', 1, 4),
    (new_company, new_firm, 'sale_return', fy, 'CN/', 1, 4),
    (new_company, new_firm, 'purchase_return', fy, 'DN/', 1, 4),
    (new_company, new_firm, 'quotation', fy, 'QT/', 1, 4),
    (new_company, new_firm, 'mfg', fy, 'MFG/', 1, 4);

  -- Milestone 15B: auto-seed the current fiscal period so the Accounting
  -- Platform's canPostOn() has something to find on this company's very
  -- first posting attempt (it fails closed when none is registered).
  -- One period spans the whole FY -- month/quarter-granularity period
  -- management is a future close/reopen/lock workflow, not this table's
  -- concern at company-creation time.
  if coalesce(_fy_start_month, 4) <= extract(month from current_date)::int then
    fy_start_year := extract(year from current_date)::int;
  else
    fy_start_year := extract(year from current_date)::int - 1;
  end if;
  fy_start_date := make_date(fy_start_year, coalesce(_fy_start_month, 4), 1);
  fy_end_date := (fy_start_date + interval '1 year' - interval '1 day')::date;

  insert into fiscal_periods(company_id, fiscal_year, label, start_date, end_date, status)
    values (new_company, fy, 'FY ' || fy, fy_start_date, fy_end_date, 'open');

  -- Milestone 15B Blocker 2: every new company gets a postable chart of
  -- accounts immediately, not an empty one a human has to configure by
  -- hand before the first sale can post. See bootstrap_accounting_defaults()'s
  -- own header for what it does and does not set up.
  perform bootstrap_accounting_defaults(new_company);

  return new_company;
end;
$$;

-- =====================================================================
-- create_firm: add another firm to an existing company
-- =====================================================================
create or replace function create_firm(
  _company_id uuid,
  _name text,
  _is_gst boolean,
  _gstin text default null,
  _state_code text default null,
  _address text default null,
  _phone text default null,
  _email text default null,
  _make_default boolean default false
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  new_firm uuid;
  fy text;
  fy_start int;
begin
  if not is_owner_of_company(_company_id) then
    raise exception 'not an owner/manager of this company';
  end if;
  if coalesce(trim(_name), '') = '' then raise exception 'firm name required'; end if;

  select fy_start_month into fy_start from companies where id = _company_id;

  if _make_default then
    update firms set is_default = false where company_id = _company_id and is_default;
  end if;

  insert into firms(
    company_id, name, is_gst_registered, gstin, state_code, address, phone, email,
    is_default, sort_order
  ) values (
    _company_id, _name, _is_gst, _gstin, _state_code, _address, _phone, _email,
    _make_default,
    (select coalesce(max(sort_order), 0) + 1 from firms where company_id = _company_id)
  ) returning id into new_firm;

  fy := current_fy(current_date, coalesce(fy_start, 4));
  insert into invoice_prefixes(company_id, firm_id, doc_type, fy_label, prefix, next_seq, pad_width) values
    (_company_id, new_firm, 'sale', fy, 'INV/', 1, 4),
    (_company_id, new_firm, 'purchase', fy, 'PUR/', 1, 4),
    (_company_id, new_firm, 'sale_return', fy, 'CN/', 1, 4),
    (_company_id, new_firm, 'purchase_return', fy, 'DN/', 1, 4),
    (_company_id, new_firm, 'quotation', fy, 'QT/', 1, 4),
    (_company_id, new_firm, 'mfg', fy, 'MFG/', 1, 4);

  return new_firm;
end;
$$;

-- =====================================================================
-- Enable RLS on every table
-- =====================================================================
alter table companies                enable row level security;
alter table company_members          enable row level security;
alter table firms                    enable row level security;
alter table parties                  enable row level security;
alter table items                    enable row level security;
alter table item_custom_field_defs   enable row level security;
alter table item_custom_field_values enable row level security;
alter table batches                  enable row level security;
alter table stock_ledger             enable row level security;
alter table payment_types            enable row level security;
alter table invoice_prefixes         enable row level security;
alter table invoices                 enable row level security;
alter table invoice_lines            enable row level security;
alter table payments                 enable row level security;
alter table purchases                enable row level security;
alter table purchase_lines           enable row level security;
alter table manufacturing_runs       enable row level security;
alter table manufacturing_lines      enable row level security;
alter table loyalty_transactions     enable row level security;
alter table print_settings           enable row level security;
alter table audit_log                enable row level security;
alter table invoice_attachments      enable row level security;
alter table accounts                 enable row level security;
alter table fiscal_periods           enable row level security;
alter table journal_entries          enable row level security;
alter table journal_lines            enable row level security;
alter table accounting_settings      enable row level security;
alter table journal_number_counters  enable row level security;

-- =====================================================================
-- RLS POLICIES
-- =====================================================================

-- companies: see any you belong to; owners can update; owners can delete
create policy co_select on companies for select using (is_member_of_company(id));
create policy co_update on companies for update using (is_owner_of_company(id)) with check (is_owner_of_company(id));
create policy co_delete on companies for delete using (is_owner_of_company(id));
-- INSERT is done via create_company() RPC (security definer)

-- company_members
create policy cm_select on company_members for select
  using (user_id = auth.uid() or is_owner_of_company(company_id));
create policy cm_insert on company_members for insert
  with check (is_owner_of_company(company_id));
create policy cm_update on company_members for update
  using (is_owner_of_company(company_id))
  with check (is_owner_of_company(company_id));
create policy cm_delete on company_members for delete
  using (is_owner_of_company(company_id));

-- firms: see any within your company; only owners/managers modify
create policy firm_select on firms for select using (is_member_of_company(company_id));
create policy firm_insert on firms for insert with check (is_owner_of_company(company_id));
create policy firm_update on firms for update
  using (is_owner_of_company(company_id))
  with check (is_owner_of_company(company_id));
create policy firm_delete on firms for delete using (is_owner_of_company(company_id));

-- Generic policy loop for every other company-scoped table
do $$
declare t text;
tables text[] := array[
  'parties','items','item_custom_field_defs','item_custom_field_values',
  'batches','stock_ledger','payment_types','invoice_prefixes',
  'invoices','invoice_lines','payments',
  'purchases','purchase_lines',
  'manufacturing_runs','manufacturing_lines',
  'loyalty_transactions','print_settings','audit_log','invoice_attachments'
];
begin
  foreach t in array tables loop
    execute format(
      'create policy %I_all on %I for all using (is_member_of_company(company_id)) with check (is_member_of_company(company_id));',
      t, t
    );
  end loop;
end $$;

-- =====================================================================
-- Accounting Platform RLS (Milestone 15B) -- deliberately NOT the generic
-- %I_all loop above. See the Milestone 15B design review §3: journal data
-- needs default-deny writes, not member-level insert/update/delete.
-- =====================================================================

-- accounts: members read; only owners/managers create or edit. No delete
-- policy -- deactivate via status, never delete a ledger account.
create policy accounts_select on accounts for select using (is_member_of_company(company_id));
create policy accounts_insert on accounts for insert with check (is_owner_of_company(company_id));
create policy accounts_update on accounts for update
  using (is_owner_of_company(company_id)) with check (is_owner_of_company(company_id));

-- fiscal_periods: members read only. State transitions (and the initial
-- seed at company creation) happen through security-definer functions,
-- which check membership/ownership by hand -- no client-side write policy.
create policy fiscal_periods_select on fiscal_periods for select using (is_member_of_company(company_id));

-- journal_entries / journal_lines: members read only. Every write goes
-- through post_journal_entry() / reverse_journal_entry()
-- (accounting_rpc.sql, security definer), which check membership/ownership
-- by hand the same way create_sale/create_purchase/create_manufacturing
-- already do. No insert/update/delete policy exists for either table --
-- this is deliberate: a journal entry is never edited or deleted, only
-- reversed by a new entry.
create policy je_select on journal_entries for select using (is_member_of_company(company_id));
create policy jl_select on journal_lines for select using (is_member_of_company(company_id));

-- accounting_settings: members read the account-role mapping; only
-- owners/managers configure it.
create policy acct_settings_select on accounting_settings for select using (is_member_of_company(company_id));
create policy acct_settings_insert on accounting_settings for insert with check (is_owner_of_company(company_id));
create policy acct_settings_update on accounting_settings for update
  using (is_owner_of_company(company_id)) with check (is_owner_of_company(company_id));

-- journal_number_counters: members read (so a UI can preview the next
-- number); all writes happen inside next_journal_number()'s row lock in
-- accounting_rpc.sql -- no client-side insert/update policy.
create policy jnc_select on journal_number_counters for select using (is_member_of_company(company_id));

-- Done. Next: sale_rpc.sql
