-- Supplier metadata: persist the detected phone number alongside address.
-- The extractor already captures supplier.phone + supplier.address; this gives
-- phone a home on the invoice and backfills both from existing extraction logs.

alter table invoices add column if not exists phone text;

-- backfill phone + address from each invoice's most recent extraction
update invoices i set
  phone   = coalesce(i.phone,   el.extracted_json->'supplier'->>'phone'),
  address = coalesce(i.address, el.extracted_json->'supplier'->>'address')
from (
  select distinct on (invoice_id) invoice_id, extracted_json
  from extraction_logs
  where invoice_id is not null
  order by invoice_id, created_at desc
) el
where el.invoice_id = i.id;
