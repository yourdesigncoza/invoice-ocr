-- 0006: multi-tenant — per-user ownership + RLS scoped to auth.uid().
-- Tables were truncated before this migration, so user_id is added NOT NULL with
-- no backfill. Storage objects are namespaced under <user_id>/... so the bucket
-- policy can enforce the same boundary.

-- 1. ownership column on every owned table (denormalised → uniform, fast RLS)
alter table suppliers         add column user_id uuid not null references auth.users(id) on delete cascade;
alter table invoices          add column user_id uuid not null references auth.users(id) on delete cascade;
alter table invoice_items     add column user_id uuid not null references auth.users(id) on delete cascade;
alter table document_uploads  add column user_id uuid not null references auth.users(id) on delete cascade;
alter table extraction_logs   add column user_id uuid not null references auth.users(id) on delete cascade;
alter table extraction_fields add column user_id uuid not null references auth.users(id) on delete cascade;
alter table duplicate_checks  add column user_id uuid not null references auth.users(id) on delete cascade;
alter table projects          add column user_id uuid not null references auth.users(id) on delete cascade;

create index if not exists suppliers_user_idx         on suppliers(user_id);
create index if not exists invoices_user_idx          on invoices(user_id);
create index if not exists invoice_items_user_idx     on invoice_items(user_id);
create index if not exists document_uploads_user_idx  on document_uploads(user_id);
create index if not exists extraction_logs_user_idx   on extraction_logs(user_id);
create index if not exists extraction_fields_user_idx on extraction_fields(user_id);
create index if not exists duplicate_checks_user_idx  on duplicate_checks(user_id);
create index if not exists projects_user_idx          on projects(user_id);

-- 2. FK the "who did it" columns to auth.users (audit trail survives user delete)
alter table invoices          add constraint invoices_approved_by_fkey       foreign key (approved_by)  references auth.users(id) on delete set null;
alter table document_uploads  add constraint document_uploads_uploaded_by_fkey foreign key (uploaded_by) references auth.users(id) on delete set null;
alter table extraction_fields add constraint extraction_fields_corrected_by_fkey foreign key (corrected_by) references auth.users(id) on delete set null;
alter table duplicate_checks  add constraint duplicate_checks_resolved_by_fkey foreign key (resolved_by) references auth.users(id) on delete set null;
alter table audit_logs        add constraint audit_logs_user_id_fkey         foreign key (user_id)      references auth.users(id) on delete set null;

-- 3. RLS: replace the blanket authenticated_all with per-owner policies
do $$
declare t text;
begin
  foreach t in array array['suppliers','invoices','invoice_items','document_uploads',
    'extraction_logs','extraction_fields','duplicate_checks','projects'] loop
    execute format('drop policy if exists "authenticated_all" on %I', t);
    execute format('create policy "owner_all" on %I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

drop policy if exists "authenticated_all" on audit_logs;
create policy "owner_audit" on audit_logs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 4. Storage: isolate by first path segment = the owner's uid
drop policy if exists "invoices_read"  on storage.objects;
drop policy if exists "invoices_write" on storage.objects;
create policy "invoices_owner_read" on storage.objects for select to authenticated
  using (bucket_id = 'invoices' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "invoices_owner_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'invoices' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "invoices_owner_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'invoices' and (storage.foldername(name))[1] = auth.uid()::text);
