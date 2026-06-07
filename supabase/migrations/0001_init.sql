-- Invoice OCR & Supplier Spend Intelligence — initial schema (PRD §11)
-- Postgres / Supabase.  Run via: npx supabase db push  (or paste in SQL editor)

create extension if not exists "uuid-ossp";
create extension if not exists pg_trgm;       -- fuzzy supplier-name matching

-- ── enums ────────────────────────────────────────────────────────────────
do $$ begin
  create type invoice_status as enum (
    'processing','needs_review','approved','rejected',
    'duplicate','low_confidence','not_invoice');
exception when duplicate_object then null; end $$;

do $$ begin
  create type document_type as enum (
    'Tax Invoice','Receipt','Cash Sale','Purchase Notice',
    'Prepaid Electricity','Statement','Unknown','Not Invoice');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_method as enum ('Cash','Card','EFT','Account','COD','Unknown');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status as enum ('Paid','Unpaid','Unknown','COD','Account');
exception when duplicate_object then null; end $$;

-- ── suppliers (silos) ────────────────────────────────────────────────────
create table if not exists suppliers (
  id                 uuid primary key default uuid_generate_v4(),
  supplier_name      text not null,
  normalized_name    text not null,
  parent_supplier_id uuid references suppliers(id) on delete set null,
  vat_number         text,
  phone              text,
  email              text,
  address            text,
  category           text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists suppliers_normalized_trgm
  on suppliers using gin (normalized_name gin_trgm_ops);
create index if not exists suppliers_vat_idx on suppliers(vat_number);

-- ── invoices ─────────────────────────────────────────────────────────────
create table if not exists invoices (
  id                     uuid primary key default uuid_generate_v4(),
  supplier_id            uuid references suppliers(id) on delete set null,
  original_supplier_name text,
  invoice_number         text,
  invoice_date           date,
  due_date               date,
  document_type          document_type not null default 'Unknown',
  subtotal_excl_vat      numeric(14,2),
  vat_amount             numeric(14,2),
  total_incl_vat         numeric(14,2),
  currency_code          text not null default 'ZAR',
  payment_status         payment_status,
  payment_method         payment_method,
  po_number              text,
  reference_number       text,
  vat_number             text,
  address                text,
  confidence_score       numeric(4,3),                 -- 0.000–1.000
  status                 invoice_status not null default 'processing',
  warnings               text[] not null default '{}',
  original_file_path     text,                         -- never mutated
  processed_file_path    text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  approved_at            timestamptz,
  approved_by            uuid
);
create index if not exists invoices_status_idx   on invoices(status);
create index if not exists invoices_date_idx      on invoices(invoice_date);
create index if not exists invoices_supplier_idx  on invoices(supplier_id);
-- supports primary duplicate key: supplier + number + date + total
create index if not exists invoices_dupe_idx
  on invoices(supplier_id, invoice_number, invoice_date, total_incl_vat);

-- ── invoice line items ───────────────────────────────────────────────────
create table if not exists invoice_items (
  id          uuid primary key default uuid_generate_v4(),
  invoice_id  uuid not null references invoices(id) on delete cascade,
  description text,
  quantity    numeric(14,3),
  unit_price  numeric(14,2),
  line_total  numeric(14,2),
  vat_rate    numeric(5,2),
  category    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists invoice_items_invoice_idx on invoice_items(invoice_id);

-- ── raw uploads ──────────────────────────────────────────────────────────
create table if not exists document_uploads (
  id            uuid primary key default uuid_generate_v4(),
  file_name     text not null,
  file_path     text not null,
  file_type     text,
  file_size     bigint,
  upload_status text not null default 'uploaded',
  uploaded_by   uuid,
  invoice_id    uuid references invoices(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- ── extraction audit (raw OCR + json + provider) ─────────────────────────
create table if not exists extraction_logs (
  id                     uuid primary key default uuid_generate_v4(),
  document_upload_id     uuid references document_uploads(id) on delete set null,
  invoice_id             uuid references invoices(id) on delete set null,
  provider_name          text not null,
  provider_model         text,
  raw_ocr_text           text,
  extracted_json         jsonb,
  validated_json         jsonb,
  confidence_score       numeric(4,3),
  warnings               text[] not null default '{}',
  errors                 text[] not null default '{}',
  processing_duration_ms integer,
  created_at             timestamptz not null default now()
);

-- per-field correction audit (PRD §11.5.1) — powers review UX & quality stats
create table if not exists extraction_fields (
  id                     uuid primary key default uuid_generate_v4(),
  invoice_id             uuid not null references invoices(id) on delete cascade,
  field_name             text not null,
  raw_value              text,
  normalized_value       text,
  confidence_score       numeric(4,3),
  source_type            text,                          -- ocr / vision / manual
  was_manually_corrected boolean not null default false,
  corrected_by           uuid,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists extraction_fields_invoice_idx on extraction_fields(invoice_id);

-- ── duplicate checks ─────────────────────────────────────────────────────
create table if not exists duplicate_checks (
  id                            uuid primary key default uuid_generate_v4(),
  invoice_id                    uuid not null references invoices(id) on delete cascade,
  possible_duplicate_invoice_id uuid not null references invoices(id) on delete cascade,
  match_score                   numeric(4,3) not null,
  match_reason                  text not null,
  status                        text not null default 'open',
  created_at                    timestamptz not null default now(),
  resolved_at                   timestamptz,
  resolved_by                   uuid
);
create index if not exists duplicate_checks_invoice_idx on duplicate_checks(invoice_id);

-- ── audit log of manual corrections ──────────────────────────────────────
create table if not exists audit_logs (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid,
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  old_value   jsonb,
  new_value   jsonb,
  created_at  timestamptz not null default now()
);

-- ── updated_at trigger ───────────────────────────────────────────────────
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;

do $$ declare t text;
begin
  foreach t in array array['suppliers','invoices','invoice_items','extraction_fields']
  loop
    execute format(
      'drop trigger if exists trg_%1$s_updated on %1$s;
       create trigger trg_%1$s_updated before update on %1$s
       for each row execute function set_updated_at();', t);
  end loop;
end $$;

-- ── storage bucket for original/processed invoice files ──────────────────
insert into storage.buckets (id, name, public)
values ('invoices','invoices', false)
on conflict (id) do nothing;

-- ── RLS ──────────────────────────────────────────────────────────────────
-- MVP: enable RLS; allow authenticated users full access. Tighten to
-- role-based (admin / reviewer / management, PRD §5) in a later migration.
alter table suppliers        enable row level security;
alter table invoices         enable row level security;
alter table invoice_items    enable row level security;
alter table document_uploads enable row level security;
alter table extraction_logs  enable row level security;
alter table extraction_fields enable row level security;
alter table duplicate_checks enable row level security;
alter table audit_logs       enable row level security;

do $$ declare t text;
begin
  foreach t in array array['suppliers','invoices','invoice_items','document_uploads',
                           'extraction_logs','extraction_fields','duplicate_checks','audit_logs']
  loop
    execute format(
      'drop policy if exists "authenticated_all" on %1$s;
       create policy "authenticated_all" on %1$s
       for all to authenticated using (true) with check (true);', t);
  end loop;
end $$;

-- storage policies: authenticated users may read/write the invoices bucket
drop policy if exists "invoices_read"  on storage.objects;
drop policy if exists "invoices_write" on storage.objects;
create policy "invoices_read"  on storage.objects for select to authenticated
  using (bucket_id = 'invoices');
create policy "invoices_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'invoices');
