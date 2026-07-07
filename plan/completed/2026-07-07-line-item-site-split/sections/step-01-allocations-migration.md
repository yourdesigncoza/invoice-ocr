---
step: 1
title: Migration 0011 — invoice_site_allocations + invoice_items.project_id + backfill
status: ready
depends: []
plan: line-item-site-split
---

# Step 1: Migration 0011 — allocations table, item site column, backfill

## Objective

Create `invoice_site_allocations` (source of truth for per-site amounts), add `invoice_items.project_id`, backfill one default allocation per existing sited invoice. DB only — no app code.

## Context

### Architecture
Migrations live in `supabase/migrations/` (next number: `0011_site_allocations.sql`). Apply via Supabase MCP (`apply_migration`, project ref `kitbiplhdoabmvnrlgxa`) AND keep the `.sql` file in the repo in sync (CLAUDE.md rule). `uuid_generate_v4()` and `set_updated_at()` trigger fn exist from `0001_init.sql`. RLS pattern to mirror is migration `0006_multitenant.sql`: per-table policy `user_id = auth.uid()` for all ops.

### Database
Existing shapes:
- `invoices.project_id uuid references projects(id) on delete set null` (0003); stays and now means **default site**. `invoices.total_incl_vat numeric`, `user_id uuid not null`.
- `invoice_items` (0001): `id, invoice_id (fk cascade), description, quantity numeric(14,3), unit_price numeric(14,2), line_total numeric(14,2), vat_rate, category, created_at, updated_at` + `user_id` (added by 0006).
- `projects` (0003 + 0006): `id, name, color, archived bool, user_id`. Domain rule: projects are **archived, not deleted** in normal flow.

### Existing Patterns
0003 shows the house style: `create table if not exists`, index, updated_at trigger, RLS block at the end.

### Risk
Backfill runs over all tenants' rows — pure SQL, RLS bypassed by migration role; must copy `user_id` from the invoice. No enum changes, no code deps.

## Implementation

`supabase/migrations/0011_site_allocations.sql`:

```sql
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

drop trigger if exists trg_isa_updated on invoice_site_allocations;
create trigger trg_isa_updated before update on invoice_site_allocations
  for each row execute function set_updated_at();

alter table invoice_site_allocations enable row level security;
drop policy if exists "owner_all" on invoice_site_allocations;
create policy "owner_all" on invoice_site_allocations
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Tenant integrity (adversarial-review finding #8): the service-role client in
-- the background extract path bypasses RLS, so enforce at the DB that an
-- allocation's user matches both the invoice's and the project's owner.
create or replace function check_isa_tenant() returns trigger language plpgsql as $$
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
```

Notes locked in discussion:
- `project_id` **not null** on allocations (a null-site allocation is meaningless; unsited invoices simply have no rows).
- `on delete cascade` for project FK: acceptable because projects are archived, not deleted; if one is force-deleted its attribution goes with it (invoice + total survive; that spend becomes unallocated).
- No DB check that amounts sum to total (cross-row invariant) — enforced by the domain lib (step 2) at every write.
- `coalesce(total_incl_vat, 0)`: invoices with a site but no readable total get a 0-amount placeholder so invoice_count stats still work.

## Files to Create/Modify

| Action | File | Purpose |
|--------|------|---------|
| create | supabase/migrations/0011_site_allocations.sql | table + item column + backfill |

Apply with Supabase MCP `apply_migration` (same SQL, name `0011_site_allocations`).

## Done When

1. Migration applied; `select count(*) from invoice_site_allocations` equals `select count(*) from invoices where project_id is not null`.
2. As an authenticated test user, RLS hides other users' allocation rows (spot-check via MCP `execute_sql` with a user JWT or reasoned from policy parity with 0006).
3. `invoice_items.project_id` exists, nullable, indexed.
3b. Tenant trigger rejects an insert whose `user_id` mismatches the invoice's or project's owner (test via MCP `execute_sql` with service role).
4. Repo `.sql` file matches what was applied.

## Gotchas

- Don't add the allocations enum values anywhere near `invoice_status` — untouched.
- `on conflict` guard keeps the backfill idempotent (safe re-run).
- The service-role client bypasses RLS — later steps must stamp `user_id` on every insert (CLAUDE.md multi-tenant rule).
