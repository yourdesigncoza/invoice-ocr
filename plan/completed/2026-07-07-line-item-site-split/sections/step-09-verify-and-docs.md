---
step: 9
title: End-to-end verify + docs close-out
status: blocked
depends: [4, 5, 6, 7, 8]
plan: line-item-site-split
---

# Step 9: Verify the whole flow, update docs

## Objective

Exercise the feature end-to-end against the running app (not just tests), confirm the invariant on real data, update CLAUDE.md so future sessions know the allocation layer exists.

## Context

### Architecture
Dev server: `npm run dev` (restart if proxy/env changed). Test tenant needs ≥2 active sites (Settings → Sites) and at least: one invoice with extracted line items, one with none (poor scan from `tests/sample_invoices/` or `demo-receipts/`), one Credit Note if available. The `verify` skill bootstrapping applies — drive the affected flow.

### Risk
This is the double-count catch-net: numbers checked across register / site stats / export must agree.

## Implementation

1. **Flow check** (manual or Playwright MCP):
   - Upload batch with default site A → default allocations appear.
   - Review an items invoice: tag exceptions to site B, verify live summary, Approve. Check: sites stats (settings), filtered register (allocated portion + "of R" hint), modal breakdown, CSV export rows — all show the same two amounts, summing to the invoice total.
   - No-items invoice: manual split; over-total rejected inline; valid split persists.
   - Change default site on a split invoice via modal → allocations stay coherent (step 3 rules).
   - Single-site check: second account (or archive sites to 1) → no split UI anywhere, register/export unchanged.
2. **Invariant sweep** (Supabase MCP `execute_sql`):
   ```sql
   select i.id from invoices i
   join invoice_site_allocations a on a.invoice_id = i.id
   group by i.id, i.total_incl_vat
   having abs(coalesce(sum(a.amount),0) - coalesce(i.total_incl_vat,0)) > 0.005;
   ```
   → zero rows.
3. **Gates**: `npm run lint`, `npm test`, `npm run build`.
4. **Docs — CLAUDE.md**:
   - "Domain logic that's easy to get wrong" → extend the Sites bullet: line-item site split, default-plus-exceptions, proportional gross-up, allocations = per-site source of truth, per-site reads never sum invoice totals.
   - Data model section → add `invoice_site_allocations` + `invoice_items.project_id` (migration 0011).
   - Architecture tree → `lib/allocations/` line.
5. No extraction prompt/schema/preprocess change was made — record in progress.md that the gold-set regression rule was not triggered.

## Files to Create/Modify

| Action | File | Purpose |
|--------|------|---------|
| modify | CLAUDE.md | allocation layer documented for future sessions |

## Done When

1. Every flow-check item above observed working in the running app.
2. Invariant sweep returns zero rows.
3. All three npm gates pass.
4. CLAUDE.md updated; plan moved to `plan/completed/` per framework close-out.

## Gotchas

- Git operations only on explicit request (`ydcoza-git-actions` rule) — do NOT commit/push as part of this step.
- If Playwright is used for the mobile check, 390×844 viewport; watch for horizontal scroll on the review pane.
