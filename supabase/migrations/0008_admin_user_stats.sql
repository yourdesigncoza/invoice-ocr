-- Admin operational stats per user account.
--
-- Returns AGGREGATE usage metadata only (counts, bytes, activity timestamp) so the
-- super-admin can monitor load and OpenAI cost WITHOUT seeing any tenant invoice
-- content (amounts, suppliers, doc types, images). This deliberately stops at the
-- data-privacy boundary defined in CLAUDE.md: admin manages accounts, not data.
--
-- security definer + locked execute: only service_role (the admin page's
-- createAdminSupabase client) may call it; authenticated tenants cannot, so this
-- never becomes a cross-tenant data leak.

create or replace function public.admin_user_stats()
returns table (
  user_id          uuid,
  invoice_count    bigint,
  extraction_count bigint,
  storage_bytes    bigint,
  last_activity    timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    u.id                                   as user_id,
    coalesce(i.cnt, 0)                     as invoice_count,
    coalesce(e.cnt, 0)                     as extraction_count,
    coalesce(d.bytes, 0)                   as storage_bytes,
    greatest(i.last_at, d.last_at)         as last_activity
  from auth.users u
  left join (
    select user_id, count(*) as cnt, max(created_at) as last_at
    from public.invoices group by user_id
  ) i on i.user_id = u.id
  left join (
    select user_id, count(*) as cnt
    from public.extraction_logs group by user_id
  ) e on e.user_id = u.id
  left join (
    select user_id, sum(coalesce(file_size, 0)) as bytes, max(created_at) as last_at
    from public.document_uploads group by user_id
  ) d on d.user_id = u.id;
$$;

revoke all on function public.admin_user_stats() from public, anon, authenticated;
grant execute on function public.admin_user_stats() to service_role;
