-- Duplicate detection is now system-driven and flag-based: an invoice is
-- "suspected duplicate" when rows exist in duplicate_checks for it. The manual
-- "Mark duplicate" action (which set status='duplicate' and hid the invoice from
-- the review queue) is removed — the reviewer now sees the highlight in-line and
-- decides to accept (approve) or delete. Send any manually-marked rows back to
-- needs_review so they reappear in the queue with the duplicate highlight.
update invoices set status = 'needs_review' where status = 'duplicate';

-- NB: like 'not_invoice', the 'duplicate' value is intentionally left in the
-- invoice_status enum — Postgres can't drop an enum value in place and it's now
-- inert. The duplicate_checks table remains the source of truth for the flag.
