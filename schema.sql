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

drop table if exists invoice_attachments, audit_log, print_settings, loyalty_transactions,
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

-- Done. Next: sale_rpc.sql
