---
step: 3
title: Default-allocation sync in write paths (extract route + invoices PATCH)
status: blocked
depends: [1, 2]
plan: line-item-site-split
---

# Step 3: Keep allocations coherent on every invoice write

## Objective

One server helper, `syncAllocationsForInvoice()`, called from both invoice write paths so the "every sited invoice has allocation rows summing to total" invariant survives site changes, total corrections, and new uploads. No UI.

## Context

### Architecture
Two write paths mutate `project_id` / `total_incl_vat`:
1. **Extract route** `src/app/api/extract/route.ts` — Phase 2 `after()` background work inserts the invoice (`~line 195`, `.insert({... projectId ...})` then inserts `invoice_items` with spread `...li` + `user_id`). Uses **`createAdminSupabase()`** (no session post-response) → must stamp `user_id` explicitly on allocation inserts.
2. **Invoices PATCH** `src/app/api/invoices/[id]/route.ts:71-165` — cookie-bound RLS client; `body.linkProjectId` sets `update.project_id` (line 116-118); `body.fields` may change `total_incl_vat`; audit-logs before/after (line 139-146).

### Database
`invoice_site_allocations` from step 1: unique `(invoice_id, project_id)`, `source in ('default','items','manual')`.

### Existing Patterns
Server-only lib code that takes a client as a parameter: `src/lib/suppliers/matching.ts` ("pass an RLS-scoped client") — follow that signature style so the helper works with both admin and RLS clients.

### Risk
`api/invoices/[id]` PATCH is the god node of review writes — keep the helper call additive, after the invoice update succeeds, before the response. Extract route: allocation insert failure must not fail the whole document (mirror how item insert errors are handled — check surrounding try/catch and match it).

## Implementation

`src/lib/allocations/sync.ts` (server-side; imports the pure lib from step 2):

```ts
export async function syncAllocationsForInvoice(
  supabase: SupabaseClient,          // RLS-scoped OR admin — caller chooses
  invoice: { id: string; user_id: string; project_id: string | null; total_incl_vat: number | null },
): Promise<void>
```

Rules (revised per adversarial review 2026-07-07 — **re-derive, don't rescale**; fetch current allocations first):
- **No split exists** (0 rows, or all rows `source='default'`): replace with `defaultAllocation(project_id, total)`. Site null → delete all rows.
- **`source='items'` split exists**: **recompute from the persisted `invoice_items.project_id` tags** via `deriveFromItems(items, invoice.project_id, invoice.total_incl_vat)` — the tags are the stored user intent, so total changes AND default-site changes both fall out correctly (null tags follow the new default site automatically; no re-pointing rule, no rounding drift from repeated rescales). If derivation returns `{ error }` (mixed-sign weights after an edit): keep the existing rows and attach a warning path (log + the invoice will surface it on next review open) rather than writing a bad split.
- **`source='manual'` split exists** (no item basis): rescale proportionally `new_amount = round2(old_amount / old_sum * new_total)` with remainder onto the default-site row (else the largest-|amount| row); **guard `old_sum === 0`** → replace with `defaultAllocation(...)`. Default-site change with a manual split: re-point the old default-site row (merge on unique-constraint collision).
- All writes go through one **`replaceAllocations(client, invoiceId, userId, entries)`** helper (shared with step 4): **upsert first** (`on conflict (invoice_id, project_id) do update`), **then delete stray rows** not in the new set — never delete-then-insert, so a crash mid-way leaves extra/stale rows (repairable, invoice still visible in reports) instead of zero rows (invoice silently vanishes from per-site reads).
- `replaceAllocations` **requires** `userId` and stamps it on every row (the admin-client path bypasses RLS; the step-1 tenant trigger is the backstop).

Wire-up:
0. **extract route Phase 1** (session still available): validate the form's `projectId` resolves via the **RLS client** before storing — a forged foreign project id must 400 here, because Phase 2 runs with the admin client (review finding: ownership validation must cover every `project_id` write, not just splits).
1. **extract route**: after the invoice insert succeeds and `projectId` is non-null, call `syncAllocationsForInvoice(supabase, { id: invoice.id, user_id: userId, project_id: projectId, total_incl_vat: processed.invoiceFields.total_incl_vat })`. Failure: log via the route's existing error pattern; don't fail the doc.
2. **invoices PATCH**: after the `update` succeeds (`after` row in hand, line 129-134), if `project_id` or `total_incl_vat` changed vs `before`, call the helper with the RLS client and the `after` row. Do this BEFORE the audit-log insert so a failure surfaces as a 400 (return error) rather than a silent drift.

## Files to Create/Modify

| Action | File | Purpose |
|--------|------|---------|
| create | src/lib/allocations/sync.ts | invariant-maintaining upsert logic |
| modify | src/app/api/extract/route.ts | default allocation on new sited invoice |
| modify | src/app/api/invoices/[id]/route.ts | re-sync on site/total change |

## Done When

1. Upload a batch with a site selected → each created invoice has exactly one `default` allocation with `amount = total_incl_vat`.
2. PATCH `linkProjectId` to another site → the default row moves; to `""` → rows deleted.
3. PATCH a corrected `total_incl_vat` on (a) unsplit invoice → default row amount follows; (b) an items-sourced split → re-derived from tags, sums to new total; (c) a manual split → rescaled, sums to new total.
3b. Upload with a forged/foreign `projectId` → 400 in Phase 1, nothing stored.
4. `npm test` + `npm run build` pass.

## Gotchas

- Supabase JS has no transactions — order writes so a crash leaves recoverable state (delete-then-insert within the helper; worst case the next sync repairs).
- `total_incl_vat` comes back from Postgres as a string in some client versions — `Number()` before math.
- Do NOT call the helper on status-only PATCHes (approve/reject) — compare `before` vs `after` values first; keeps approve fast and audit noise down.
- Extract route: `userId` variable already in scope in the Phase 2 job context (route line ~153 destructures it).
