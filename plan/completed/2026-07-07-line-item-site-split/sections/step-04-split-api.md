---
step: 4
title: Split API — item site tags + manual split on invoices PATCH/GET
status: blocked
depends: [1, 2, 3]
plan: line-item-site-split
---

# Step 4: Split API on `api/invoices/[id]`

## Objective

PATCH accepts a `split` payload (item tags or manual amounts), persists `invoice_items.project_id`, derives + replaces allocations, audit-logs. GET returns allocations so the modal/review can render the breakdown.

## Context

### Architecture
`src/app/api/invoices/[id]/route.ts` — cookie-bound RLS client (`createServerSupabase()`), `getUser()` guard, RLS is the IDOR protection (no manual owner filters — CLAUDE.md). GET (line 18-51) already returns `{ imageUrl, isPdf, items }`. PATCH (line 71-165): `PatchBody` interface at line 53-64; audit-log insert at line 139-146; `correctedFields` handling at line 150-162.

### Database
`invoice_items.project_id` (step 1, nullable = default site). `invoice_site_allocations` unique `(invoice_id, project_id)`. `projects` RLS = owner-scoped (0006), so fetching project ids through the RLS client is the ownership check: another user's project id simply returns no row.

### Existing Patterns
Error style: `NextResponse.json({ error: message }, { status: 400 })`. Type additions go in `src/lib/types.ts` (add `project_id: string | null` to `InvoiceItem`, new `InvoiceSiteAllocation` interface) — types.ts is imported by client components, keep it dependency-free.

### Risk
God node (all review writes). Additive only: `split` is optional; existing payloads must behave byte-identically. Cross-tenant hole to close: a forged `project_id` in the payload — validate every referenced project id resolves via the RLS client before writing.

## Implementation

1. Extend `PatchBody`:
```ts
split?:
  | { mode: "items"; itemProjects: Record<string, string | null> }  // item_id → project_id (null = default site)
  | { mode: "manual"; exceptions: { project_id: string; amount: number }[] }
  | { mode: "clear" };   // back to single default allocation
```

2. **Preflight — validate the ENTIRE payload before any write** (review finding #3: a split failure must not leave a half-committed invoice update):
   - Collect every referenced project id: `body.linkProjectId` too, not just split targets (review finding #1 — plain site changes were unvalidated). One `select id from projects .in(ids)` via RLS client; any missing → 400 "Unknown site", nothing written.
   - `mode: "items"`: fetch the invoice's items, apply `body.split.itemProjects` in memory (reject item ids not belonging to this invoice), run `deriveFromItems(...)` with the would-be post-update `project_id`/`total_incl_vat`; `{error}` → 400.
   - `mode: "manual"`: `manualSplit(...)` in memory; `{error}` → 400.
   Only after preflight passes, mutate — in this order:
   - Invoice `update` (fields / supplier / project / status) as today.
   - `mode: "items"`: persist item tags (`update invoice_items set project_id ... eq("invoice_id", id)`); `mode: "clear"`: null all tags.
   - `replaceAllocations(supabase, id, user.id, entries)` — the shared step-3 helper (upsert-then-delete-strays; never delete-then-insert).
   - **One** audit-log insert, last, recording what actually happened: existing `before`/`after` snapshot with `new_value` extended by `{ site_split: entries }` (PRD §13.3). No transactions exist, so audit-after-mutations is the honest ordering; partial-failure repair is step 3's sync + step 9's invariant sweep.

3. Extend GET response with `allocations` (join project name): `.from("invoice_site_allocations").select("*, project:projects(id,name,color)").eq("invoice_id", id)`.

4. `src/lib/types.ts`: `InvoiceItem` + `project_id: string | null`; add:
```ts
export interface InvoiceSiteAllocation {
  id: string; invoice_id: string; project_id: string; amount: number;
  source: "default" | "items" | "manual";
  project?: { id: string; name: string; color: string | null } | null;
}
```

## Files to Create/Modify

| Action | File | Purpose |
|--------|------|---------|
| modify | src/app/api/invoices/[id]/route.ts | split handling in PATCH; allocations in GET |
| modify | src/lib/types.ts | InvoiceItem.project_id; InvoiceSiteAllocation |

## Done When

1. PATCH with `split.mode="items"` tagging 2 of N items → items updated, allocations rows sum to `total_incl_vat`, GET returns them with project names.
2. `split.mode="manual"` exceeding total → 400 with the lib's error message; valid → remainder row on default site.
3. `split.mode="clear"` → single default row, item tags nulled.
4. PATCH with a project id belonging to another user → 400, nothing written.
5. Legacy PATCH payloads (no `split`) behave exactly as before; `npm run build` regenerates `.next/types` cleanly; `npm test` green.

## Gotchas

- Preflight derives with the *would-be* post-update total/site — pass those values explicitly, don't read them back mid-request.
- If BOTH `linkProjectId` and `split` arrive, skip the step-3 sync call entirely for this request — the split replacement is about to overwrite whatever sync would write (avoid two writers per request).
- `manualSplit` exceptions must not name the default site — the lib rejects; surface its message as-is.
- Postgres numeric → string coercion on read: `Number()` amounts before returning JSON if needed for consistency.
