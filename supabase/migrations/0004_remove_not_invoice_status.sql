-- Remove the 'not_invoice' disposition: it was functionally identical to
-- 'rejected' (both soft-park a record out of the queue and out of spend
-- reporting), so the duplicate action was dropped from the app. Reclassify any
-- existing rows as rejected so no live record uses the retired status.
update invoices set status = 'rejected' where status = 'not_invoice';

-- NB: the 'not_invoice' value is intentionally left in the invoice_status enum.
-- Postgres can't drop an enum value in place (it needs a full type recreation:
-- rename → recreate → re-cast the column → drop default/re-add), which is risky
-- for no functional gain now that nothing reads or writes it. It is inert.
