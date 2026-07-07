---
plan: line-item-site-split
created: 2026-07-07
status: briefed
---

# Brief: Line-item site split (multi-site invoice allocation)

## Original Instruction

> Users with multiple "sites" want to split a receipt/invoice across different sites. Discussed and agreed: line-item tagging (not manual amount arithmetic) as the primary UX; **default-site-plus-exceptions** (invoice keeps its main site, user tags only exception lines); **proportional gross-up** of `total_incl_vat` from tagged item weights into a per-site allocations table; amount-entry fallback when no line items extracted; gated behind the existing ≥2-active-sites adaptive mechanism.

## Evaluation

| Dimension | Status | Notes |
|-----------|--------|-------|
| Scope | ✅ | New feature: multi-site allocation of a single invoice |
| Module | ✅ | DB, `lib/allocations` (new), extract route, invoices API, review UI, modal, register/site stats, export |
| Done condition | ✅ | Acceptance criteria below; verifiable per surface |
| Constraints | ✅ | Multi-tenant RLS, audit logging, reconcile-to-total invariant, adaptive gating, mobile review UX, no extraction-pipeline changes |
| Scale | ✅ | Cross-cutting but bounded; no extraction prompt/schema change → no gold-set re-run |

All ✅ — clarifying answers already captured (AskUserQuestion 2026-07-07):
1. Register filtered by site shows the **allocated portion** (with "of R total" hint).
2. CSV export = **one row per site allocation**.
3. No-line-items fallback = **rand amounts per exception site**, default site takes remainder.

## Clarified Requirement

Add a per-site allocation layer on top of invoices. `invoices.project_id` stays and means "default site". A new `invoice_site_allocations` table is the **source of truth for per-site amounts** — every sited invoice has ≥1 row; unsplit = single default row (backfilled + kept in sync automatically). Splits are produced two ways: (a) primary — tag exception line items to other sites in the review screen / modal; per-site amounts are derived by **proportional gross-up**: site share = (site's tagged `line_total` sum ÷ all items' sum) × `total_incl_vat`, cent remainder to the default site, so allocations always reconcile to the invoice total regardless of VAT presentation or missed lines; (b) fallback (no extracted items) — type rand amounts for exception sites, remainder auto-assigned to default site.

Reporting reads switch to allocations: per-site spend stats, register site filter (row shows allocated portion), and range CSV export (one row per allocation). Whole-account numbers (dashboard) stay invoice-based. Split UI appears only when the user has ≥2 active sites (existing `projectsEnabled()` gate); single-site users see zero change.

## Acceptance Criteria

1. Migration adds `invoice_site_allocations` (RLS `user_id = auth.uid()`) + `invoice_items.project_id`, and backfills one default allocation per existing sited invoice.
2. For any invoice, `sum(allocations.amount) = total_incl_vat` (± nothing — cent remainder absorbed), enforced by the derive functions; unit tests prove rounding, all-default, and credit-note (negative total) cases.
3. New invoices assigned a site at upload get a default allocation row automatically; changing site or total via PATCH keeps allocations coherent.
4. Review screen (≥2 sites): each line-item row can be tagged to a site (default = invoice's site); live summary shows per-site derived amounts; save persists tags + allocations; audit-logged.
5. Review screen fallback (≥2 sites, 0 items): amount inputs per exception site, remainder line auto-computed; validation rejects exceptions exceeding the total.
6. Invoice modal shows the split breakdown and allows the same edit.
7. Site spend stats (`getProjects`) sum allocation amounts (approved only); register filtered by site lists invoices via allocations and shows the allocated portion.
8. Range CSV export emits one row per allocation with site name + allocated amount; VAT summary export unchanged (invoice-level).
9. Users with 0–1 active sites see no split UI anywhere; `npm run build`, `npm run lint`, `npm test` pass.

## Out of Scope

- Splitting a single line item across sites (a line belongs to exactly one site).
- Per-site VAT apportionment (VAT reporting stays invoice-level).
- Editing/correcting extracted line items in review (table stays read-only apart from the site tag).
- Any extraction prompt/schema/preprocessing change (so the gold-set regression rule is not triggered).
- Dashboard site dimension / per-site report pages (reports remain period-based; site stats live where they do today).
- Retro-splitting UI for bulk historical invoices (they get default allocations via backfill; can be split one-by-one).
