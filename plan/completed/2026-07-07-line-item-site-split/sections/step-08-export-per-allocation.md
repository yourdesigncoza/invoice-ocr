---
step: 8
title: CSV export — one row per site allocation
status: blocked
depends: [7]
plan: line-item-site-split
---

# Step 8: Export one row per allocation

## Objective

Range CSV export emits one row per site allocation (user decision 2026-07-07): a 2-site split = 2 rows, each with its site name + allocated amount. VAT summary export unchanged.

## Context

### Architecture
- `src/lib/export/csv.ts`: `invoicesToRows()` (line 25-41) maps one row per invoice — `site: i.project?.name ?? ""`, money columns `subtotal_excl_vat / vat_amount / total_incl_vat`. `vatSummaryRows()` (line 48-90) is invoice-level monthly roll-up — leave alone.
- `src/app/api/export/route.ts`: fetches invoices for the range (via `getInvoices`-style read) and streams CSV. Consumed by `(app)/exports` page (`ExportRangeForm`).

### Existing Patterns
`cell()`/`toCsv()` header derivation uses `Object.keys(rows[0])` — every row must have identical key sets.

### Risk
Low. Accountant-facing shape change: invoice-level columns repeat across a split invoice's rows — that's the accepted trade for pivotability.

## Implementation

1. Export route: fetch allocations for the invoice ids in range (one query: `from("invoice_site_allocations").select("invoice_id, amount, project:projects(name)").in("invoice_id", ids)`), group by invoice.
2. `invoicesToRows(invoices, allocationsByInvoice)`:
   - invoice with allocations → one row per allocation: `site` = allocation's project name, new column `site_amount` = allocation amount; invoice-level columns (`total_incl_vat`, VAT, etc.) repeated verbatim.
   - invoice without allocations (unsited) → single row, `site` empty, `site_amount` = `total_incl_vat` (keeps the column sum meaningful).
   - Column order: insert `site_amount` right after `site`.
3. Keep the function signature backward-compatible (`allocationsByInvoice` optional; absent → today's behavior) so `tests/unit/export.test.ts` existing cases still pass; add cases: split invoice → 2 rows summing `site_amount` to total; unsited invoice → `site_amount = total`.

## Files to Create/Modify

| Action | File | Purpose |
|--------|------|---------|
| modify | src/lib/export/csv.ts | per-allocation row fan-out + site_amount column |
| modify | src/app/api/export/route.ts | fetch + pass allocations |
| modify | tests/unit/export.test.ts | split/unsited cases |

## Done When

1. Export a range containing one split invoice → CSV has a row per site; `Σ site_amount` per invoice = `total_incl_vat`; pivot by `site` in a spreadsheet gives correct per-site sums.
2. Export for a single-site user → byte-identical to today except the added `site_amount` column.
3. VAT summary export output unchanged (test asserts).
4. `npm test` green.

## Gotchas

- Don't fan out the VAT summary — it consumes the invoices list, not rows; a split invoice must count once per month, not once per site.
- `toCsv` header from first row: ensure the no-allocation row shape includes `site_amount` too (uniform keys).
- Money cells: `round2` allocation amounts (numeric strings from PG).
