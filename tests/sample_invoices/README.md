# Gold-standard sample set

Drop a hand-picked, representative subset of real invoices here (30–50, PRD §12.1)
to use as the extraction regression set. Cover every hard case:

- Thermal till slips
- Formal A4 tax invoices
- Cropped / skewed WhatsApp photos
- Purchase notices (e.g. prepaid electricity)
- Receipts with missing VAT
- Repeat suppliers under inconsistent names
- Handwritten / partly handwritten documents

For each, capture the correct supplier, date, total, VAT, document type, and
invoice number in a sidecar `*.expected.json`, then measure extraction accuracy
field-by-field. **Re-run this set after any change to the extraction prompt,
schema, preprocessing, or provider** (PRD §12.2) — don't improve one document
type while regressing another.

> Real client invoices are git-ignored at the repo root (`/WhatsApp*`). Only a
> de-identified subset intended as fixtures belongs in version control — and even
> then, confirm with the client first.
