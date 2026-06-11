-- Add "Credit Note" to the document_type enum.
--
-- Revives validate.ts's negative-total exemption (it tests
-- /credit|refund/ against document_type, which previously could never match a
-- real enum value) so a legitimate supplier credit note no longer hard-fails as
-- "Negative total on a non-credit document".
alter type document_type add value if not exists 'Credit Note';
