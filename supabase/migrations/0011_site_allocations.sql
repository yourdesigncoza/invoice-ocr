-- Per-site allocation of an invoice's total (source of truth for per-site
-- amounts). Unsplit invoice = single 'default' row mirroring invoices.project_id.
-- Invariant (app-enforced): sum(amount) over an invoice = total_incl_vat.

create table if not exists invoice_site_allocations (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  invoice_id uuid not null references invoices(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  amount     numeric(14,2) not null,        -- may be negative (Credit Note)
  source     text not null default 'default'
             check (source in ('default','items','manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (invoice_id, project_id)
);
create index if not exists isa_invoice_idx on invoice_site_allocations(invoice_id);
create index if not exists isa_project_idx on invoice_site_allocations(project_id);

-- updated_at trigger (reuses set_updated_at() from 0001)
drop trigger if exists trg_isa_updated on invoice_site_allocations;
create trigger trg_isa_updated before update on invoice_site_allocations
  for each row execute function set_updated_at();

alter table invoice_site_allocations enable row level security;
drop policy if exists "owner_all" on invoice_site_allocations;
create policy "owner_all" on invoice_site_allocations
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Tenant integrity: the service-role client (background extract path) bypasses
-- RLS, so enforce at the DB that an allocation's user matches both the
-- invoice's and the project's owner.
create or replace function check_isa_tenant() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is distinct from (select user_id from invoices where id = new.invoice_id)
     or new.user_id is distinct from (select user_id from projects where id = new.project_id) then
    raise exception 'allocation tenant mismatch';
  end if;
  return new;
end $$;
drop trigger if exists trg_isa_tenant on invoice_site_allocations;
create trigger trg_isa_tenant before insert or update on invoice_site_allocations
  for each row execute function check_isa_tenant();

-- Which site each extracted line belongs to (null = the invoice's default site).
alter table invoice_items add column if not exists project_id uuid
  references projects(id) on delete set null;
create index if not exists invoice_items_project_idx on invoice_items(project_id);

-- Backfill: one default allocation per already-sited invoice.
insert into invoice_site_allocations (user_id, invoice_id, project_id, amount, source)
select user_id, id, project_id, coalesce(total_incl_vat, 0), 'default'
from invoices
where project_id is not null
on conflict (invoice_id, project_id) do nothing;
