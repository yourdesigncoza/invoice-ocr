-- Projects / shops — segment invoices by cost center (single owner, many
-- projects). Orthogonal to suppliers: a supplier can appear across projects.

create table if not exists projects (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null,
  color      text,                         -- optional hex for a visual tag
  archived   boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table invoices add column if not exists project_id uuid
  references projects(id) on delete set null;
create index if not exists invoices_project_idx on invoices(project_id);

-- updated_at trigger (reuses set_updated_at() from 0001)
drop trigger if exists trg_projects_updated on projects;
create trigger trg_projects_updated before update on projects
  for each row execute function set_updated_at();

-- RLS: authenticated users full access (matches the rest; tighten with roles later)
alter table projects enable row level security;
drop policy if exists "authenticated_all" on projects;
create policy "authenticated_all" on projects
  for all to authenticated using (true) with check (true);
