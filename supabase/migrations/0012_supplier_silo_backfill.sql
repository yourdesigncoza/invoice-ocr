-- Auto-silo backfill: invoices approved before auto-silo-on-approve shipped
-- have supplier_id null, so the Suppliers page sat empty unless the reviewer
-- used the manual link/create box. Create one silo per (user, normalized
-- supplier name) and link those invoices to it. New approvals are handled in
-- the PATCH route (resolveSupplierOnApproval).

-- SQL twin of normalizeName() in src/lib/suppliers/matching.ts — the steps and
-- their order must stay identical, or silos created here won't exact-match in
-- the TS ranker later.
create or replace function normalize_supplier_name(name text) returns text
language sql immutable as $$
  select trim(regexp_replace(
           regexp_replace(
             regexp_replace(
               replace(lower(coalesce(name, '')), '&', ' and '),
               '\m(pty|ltd|cc|inc|the|t/a)\M', ' ', 'g'),
             '[^a-z0-9\s]', ' ', 'g'),
           '\s+', ' ', 'g'))
$$;

-- 1) one silo per (user, normalized name) that doesn't already have one;
--    seeded from the most recent approved invoice's details
insert into suppliers (supplier_name, normalized_name, vat_number, phone, address, user_id)
select distinct on (i.user_id, normalize_supplier_name(i.original_supplier_name))
       trim(i.original_supplier_name),
       normalize_supplier_name(i.original_supplier_name),
       i.vat_number,
       i.phone,
       i.address,
       i.user_id
from invoices i
where i.supplier_id is null
  and i.status = 'approved'
  and normalize_supplier_name(i.original_supplier_name) <> ''
  and not exists (
    select 1 from suppliers s
    where s.user_id = i.user_id
      and s.normalized_name = normalize_supplier_name(i.original_supplier_name)
  )
order by i.user_id, normalize_supplier_name(i.original_supplier_name), i.created_at desc;

-- 2) link the approved, unlinked invoices to their (possibly pre-existing) silo
update invoices i
set supplier_id = s.id
from suppliers s
where i.supplier_id is null
  and i.status = 'approved'
  and s.user_id = i.user_id
  and normalize_supplier_name(i.original_supplier_name) <> ''
  and s.normalized_name = normalize_supplier_name(i.original_supplier_name);
