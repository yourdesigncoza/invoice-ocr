---
plan: line-item-site-split
created: 2026-07-07
status: reviewed
priority: high
model-planned: fable-5
---

# Plan: Line-item site split (multi-site invoice allocation)

## Context

SpendSilo invoices carry a single `invoices.project_id` (site). Builders (the core multi-site persona) get receipts covering several job sites. Agreed design: keep `project_id` as the **default site**; add `invoice_site_allocations` as source of truth for per-site amounts (single default row when unsplit); primary split UX = tag exception line items to other sites in review (`ReviewClient.tsx:402-428` already renders a read-only items table); per-site amounts derived by proportional gross-up of `total_incl_vat` (item sums are weights, never amounts — till slips are VAT-incl, A4 invoices ex-VAT, lines get missed); fallback = rand amounts per exception site. All reporting per-site reads move to allocations. Gate everything behind the existing ≥2-active-sites mechanism (`projectsEnabled()`, `data.ts:205`).

### Affected Scope
- **Modules:** DB migration; `src/lib/allocations/` (new); `src/lib/data.ts`; `src/app/api/extract/route.ts`; `src/app/api/invoices/[id]/route.ts`; `src/app/api/export/route.ts`; `src/lib/export/csv.ts`; `src/components/ReviewClient.tsx`, `InvoiceModal.tsx`, `InvoiceTable.tsx`; `src/lib/types.ts`
- **DB Tables:** `invoice_site_allocations` (new), `invoice_items` (+`project_id`), reads on `invoices`, `projects`
- **God nodes at risk:** `data.ts` (all server reads) and `api/invoices/[id]` PATCH (all review writes) — each gets its own step
- **ADRs relevant:** none (no DevVault for this repo); settled decisions live in `docs/extraction-pipeline-review.md` — none touched
- **Cross-module boundaries:** extract pipeline ↔ allocations (default-row sync); review UI ↔ API
- **Graphify blast radius:** graph not available (`graphify-out/` absent) — scoped by direct code reading instead

### Key Constraints
- Multi-tenant: new table needs `user_id` + RLS `user_id = auth.uid()`; **every insert sets `user_id`** (CLAUDE.md). Extract route Phase 2 uses the admin client → must stamp `user_id` explicitly.
- Interactive writes use the RLS client (`createServerSupabase()`) — no manual owner filters.
- Invariant: allocations always sum to `total_incl_vat` (cent remainder → default site). Negative totals (Credit Note) must split correctly.
- Edits to approved invoices are audit-logged (`audit_logs`).
- No extraction prompt/schema/preprocess change → gold-set re-run NOT required; `npm test` + `npm run build` are the gates.
- Adaptive gating: 0–1 active sites → zero UI change.
- Review screen is used on phones — tag control must work at mobile widths.

## Steps Overview

| # | Step | Depends | Estimated |
|---|------|---------|-----------|
| 1 | Migration 0011: allocations table + item site column + backfill | — | S |
| 2 | Allocation domain lib (pure derive/validate) + unit tests | — | M |
| 3 | Default-allocation sync in write paths (extract + PATCH) | 1, 2 | M |
| 4 | Split API: item tags + manual split on invoices PATCH/GET | 1, 2, 3 | M |
| 5 | Review UI: per-line site tags, live summary, manual fallback | 4 | L |
| 6 | Invoice modal: split breakdown + edit (reuse editor) | 5 | S |
| 7 | Reporting reads: site stats + register filter via allocations | 1, 3 | M |
| 8 | CSV export: one row per allocation | 7 | S |
| 9 | Verify end-to-end, docs (CLAUDE.md), close-out | 4, 5, 6, 7, 8 | S |

## Dependency Graph

```
1 (migration) ──┬─► 3 (sync) ──► 4 (API) ──► 5 (review UI) ──► 6 (modal) ─┐
2 (domain lib) ─┘                                                          ├─► 9 (verify+docs)
1, 3 ───────────────► 7 (reporting reads) ──► 8 (export) ─────────────────┘
```

## Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Double-count: a read sums invoice totals AND allocations | Medium | Rule: per-site numbers ← allocations only; whole-account ← invoices only. Step 7 touches every per-site read in one pass |
| Stale/missing default allocation (sync path forgotten) | Medium | Single sync helper, called from both write paths (step 3); step 9 invariant sweep |
| Rounding drift (split amounts ≠ total) | Low | Items splits **re-derive from persisted tags** (never rescale-of-rescale); cent remainder to default site; unit-tested incl. negative totals |
| Crash mid-replacement leaves invoice with zero allocations | Medium | `replaceAllocations` = upsert-then-delete-strays (never delete-then-insert); worst case = stale extra row, repaired by next sync / step-9 sweep |
| Mixed-sign line weights (discounts/returns) produce nonsense shares | Medium | Derivation refuses (`{error}`) → UI falls back to manual split (review decision 2026-07-07) |
| Cross-tenant project id via admin client or unvalidated write | Medium | Ownership preflight on EVERY `project_id` write (upload + PATCH + split) + DB tenant trigger in 0011 |
| Supabase `!inner` join filter syntax for register filter | Medium | Step 7 includes exact query shape + fallback (two-query approach) |
| Allocation referencing another user's project | Low | API validates project ids via RLS-scoped `projects` fetch before writing (step 4) |
| Mobile review regression (recent mobile fixes: commits 11023bf, 1ea14fb) | Medium | Step 5 keeps single-scroll layout; chips wrap; verify at 390px width |
