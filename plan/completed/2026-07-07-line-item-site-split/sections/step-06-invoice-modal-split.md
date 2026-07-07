---
step: 6
title: Invoice modal — split breakdown + edit (reuse SiteSplitEditor)
status: blocked
depends: [5]
plan: line-item-site-split
---

# Step 6: Invoice modal split view/edit

## Objective

`InvoiceModal.tsx` shows the persisted per-site breakdown and lets the user re-split post-approval (audit-logged by step 4). Reuses `SiteSplitEditor` — no new split logic.

## Context

### Architecture
`src/components/InvoiceModal.tsx` (client): opens from the register (`InvoiceTable.tsx`); fetches `GET /api/invoices/[id]` for `{ imageUrl, isPdf, items }` — step 4 added `allocations` to that response, so the modal's data need is already served. Saves via the same PATCH with `linkProjectId: projectId` (line 162). It has its own site picker mirroring the review one.

### Existing Patterns
Modal already renders items; visual language: white Card, semantic status colors. Split badge idea: reuse the chip styling from `SiteSplitEditor`'s summary bar.

### Risk
Low — reuse. Watch modal height on mobile (recent fix bc6d8d8 trimmed preview padding; don't regress the scroll behavior).

## Implementation

1. Read `allocations` from the GET payload into modal state.
2. When invoice has >1 allocation: render a compact read-only breakdown (site name + amount chips) near the site field.
3. "Edit split" expander → mounts `SiteSplitEditor` with the modal's items/projects/defaultProjectId/total; wire `onChange` into the modal's save payload (`split`).
4. Gate identically: editor + breakdown only when `projects.length >= 2` (breakdown may also show read-only if legacy multi-rows exist but sites dropped to 1 — acceptable to show read-only chips whenever `allocations.length > 1`).

## Files to Create/Modify

| Action | File | Purpose |
|--------|------|---------|
| modify | src/components/InvoiceModal.tsx | breakdown chips + SiteSplitEditor + save wiring |

## Done When

1. A split invoice's modal shows per-site chips matching `invoice_site_allocations`.
2. Editing the split from the modal persists and re-renders; audit_logs row written (step 4 path).
3. Unsplit invoice + 1-site user: modal unchanged vs today.
4. `npm run build` passes.

## Gotchas

- The modal is reachable for `approved` invoices — that's intended (split correction post-approval is a legit bookkeeping fix; audit trail covers it). Don't add a status guard.
- Modal and review must not drift: any prop added to `SiteSplitEditor` here must stay optional or be threaded through ReviewClient too.
