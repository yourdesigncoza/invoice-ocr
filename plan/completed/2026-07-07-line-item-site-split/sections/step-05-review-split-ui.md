---
step: 5
title: Review UI — per-line site tags, live summary, manual fallback
status: blocked
depends: [4]
plan: line-item-site-split
---

# Step 5: Review screen split editor

## Objective

In `ReviewClient.tsx`: (a) site tag per line-item row (default-plus-exceptions), (b) live per-site summary via the pure lib, (c) manual amount fallback when no items, (d) save through the step-4 API. Extract the editor as a reusable `SiteSplitEditor` component (modal reuses it in step 6). Only rendered with ≥2 active sites.

## Context

### Architecture
`src/components/ReviewClient.tsx` (client component): props include `items: InvoiceItem[]` and `projects: Project[]` (line 31, 62); existing single-site `<select>` at lines 327-343 (`projectId` state, shown when `projects.length > 0`); save posts `{ linkProjectId: projectId, ... }` (line 120) to `PATCH /api/invoices/[id]`. Read-only items table at lines 402-428 (Description / Qty / Total columns, `formatMoney(it.line_total, invoice.currency_code)`). The server page passing `projects` decides gating — the split UI itself should require `projects.length >= 2` (a 1-project user still gets the plain picker).

### Existing Patterns
- UI primitives in `src/components/ui.tsx` (`Card`, `Button`); Tailwind v4 tokens from `globals.css`; palette per CLAUDE.md (primary `#2563EB`).
- Mobile: review recently reworked for single-scroll + no image overlap (commits 11023bf, 1ea14fb) — don't reintroduce horizontal overflow; wide tables scroll inside their own container (pattern from commit 11d15ed).
- Money display: `formatMoney` from `src/lib/utils.ts`.

### Risk
Highest-UX-risk step. Phone widths (~390px): the items table gains a 4th column — put the site tag as a compact chip/select; let the table scroll horizontally inside its Card if needed.

## Implementation

1. **`src/components/SiteSplitEditor.tsx`** (new, client). Props:
```ts
{
  items: InvoiceItem[];                 // may be []
  projects: Project[];                  // active sites (>=2 when rendered)
  defaultProjectId: string | null;      // the invoice's site (review's projectId state)
  totalInclVat: number | null;
  currency: string;
  allocations: InvoiceSiteAllocation[]; // current persisted state (from GET)
  onChange(split: PatchSplit | null): void;  // null = no split (single default)
}
```
   - **Items mode** (`items.length > 0`): renders the line-items table (move/absorb the existing 402-428 table into this component), adding a per-row site control — default shows the default site name muted ("—" = default); tapping cycles/opens a small select of other sites. Local state `itemProjects: Record<itemId, projectId|null>` seeded from `items[].project_id`.
   - **Summary bar** under the table: `deriveFromItems(...)` from `src/lib/allocations/split.ts` (pure, client-safe) → per-site chips: `Site B · R412.30 (18.7%)`, default site last with "remainder". Shows the transparency line: "Tagged lines: R340.00 of R1,820.00 total".
   - **Derivation refusal path** (review decision 2026-07-07): when `deriveFromItems` returns `{error}` (mixed-sign/zero weights — discount or return lines), show the error inline and offer the manual mode as the fallback *even though items exist*. Manual mode is therefore reachable in both cases, not only at `items.length === 0`.
   - **Manual mode** (`items.length === 0`, or item-derivation refused): "Split across sites" toggle → rows of `[site select][amount input]` + non-editable remainder line ("Default site · R{total − Σ}"). Validation errors from `manualSplit()` inline in `text-status-low`.
   - Emits `{mode:"items", itemProjects}` / `{mode:"manual", exceptions}` / `null` upward; parent owns save.

2. **ReviewClient wiring**: fetch/receive `allocations` (review page server-side already loads the invoice — extend its data source to pull allocations via `getInvoice`, see step 7's data.ts change, or the existing GET endpoint); hold `split` state; include `split` in the PATCH body alongside `linkProjectId` on Save/Approve. Keep the existing site `<select>` — it remains the default-site picker; the editor sits with the line-items section. Changing the default site re-derives the summary live (pass current `projectId` state down).

3. Gate: render `SiteSplitEditor` only when `projects.length >= 2`. With 0-1 sites the items table renders exactly as today (keep the plain table as the editor's degenerate rendering or leave the original in place behind the gate — do NOT duplicate the table markup twice; one component, site column conditional).

## Files to Create/Modify

| Action | File | Purpose |
|--------|------|---------|
| create | src/components/SiteSplitEditor.tsx | reusable split editor (items + manual modes) |
| modify | src/components/ReviewClient.tsx | replace static items table; wire split into save |

## Done When

1. ≥2 sites + items: tag 2 rows to another site → summary shows grossed-up amounts summing to the total; Save + reload shows persisted tags and allocations.
2. ≥2 sites + 0 items: manual split with over-total amount blocked inline; valid split saves.
2b. Receipt with a negative discount line tagged to a site: derivation refuses with the lib's message; manual mode offered and works.
3. Changing the default-site select live-updates the derived summary before save.
4. 1-site user: review screen renders pixel-identical to today (no site column, no editor).
5. At 390px width: no horizontal page scroll; table scrolls within its Card; tap targets usable.
6. `npm run build` + `npm run lint` pass.

## Gotchas

- `deriveFromItems` client-side must match server derivation exactly — same function, single source (DRY); never reimplement the math in the component.
- Untagged row = default site — don't write explicit default tags into `itemProjects` (null means default so a later default-site change follows automatically).
- Save flow already tracks `correctedFields` — site tags are NOT extraction corrections; don't add them there.
- Approve action must carry the pending split too (users tag then hit Approve without Save).
