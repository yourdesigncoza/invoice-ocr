---
step: 2
title: Allocation domain lib — pure derive/validate functions + unit tests
status: ready
depends: []
plan: line-item-site-split
---

# Step 2: Allocation domain lib (pure) + unit tests

## Objective

`src/lib/allocations/split.ts`: pure, client-safe functions that turn (item site tags | manual amounts | plain default) into allocation rows that **always sum exactly to `total_incl_vat`**. Unit-tested. No DB, no imports of server-only modules (the review UI reuses these client-side for the live summary).

## Context

### Architecture
Mirrors the style of `src/lib/duplicates/detect.ts` / `src/lib/suppliers/matching.ts`: domain logic under `src/lib/<domain>/`. Must NOT import `server-only` or supabase (ReviewClient is a client component and imports these for live preview). Money helpers: `round2` pattern exists in `src/lib/export/csv.ts:5` (`Math.round(n * 100) / 100`).

### Database
Target row shape (from step 1): `{ project_id: string, amount: number, source: 'default'|'items'|'manual' }`. `InvoiceItem` type (`src/lib/types.ts:69-80`): `{ id, invoice_id, description, quantity, unit_price, line_total: number | null, vat_rate, category, ... }` — step 4 adds `project_id: string | null` to this interface.

### Existing Patterns
Tests: vitest, `tests/unit/*.test.ts`, factories in `tests/unit/_factories.ts`. Run single file: `npx vitest run tests/unit/allocations.test.ts`.

### Risk
None structural — pure math. The correctness burden of the whole feature concentrates here; be exhaustive in tests.

## Implementation

Export types + three builders:

```ts
export interface AllocationEntry { project_id: string; amount: number; source: "default" | "items" | "manual"; }
export interface TaggableItem { id: string; line_total: number | null; project_id: string | null; }
```

1. `defaultAllocation(projectId: string | null, total: number | null): AllocationEntry[]`
   — `projectId` null → `[]`; else single `'default'` row, `amount = round2(total ?? 0)`.

2. `deriveFromItems(items: TaggableItem[], defaultProjectId: string | null, totalInclVat: number | null): AllocationEntry[]`
   **Proportional gross-up (the agreed mechanic):**
   - Effective site per item: `item.project_id ?? defaultProjectId` (default-plus-exceptions). Items with null `line_total` count as 0 weight.
   - Group `sum(line_total)` per site → weights. `grand = Σ all sites`.
   - Degenerate cases → fall back to `defaultAllocation(defaultProjectId, total)`: no items, `grand === 0`, every item resolves to the default site, `defaultProjectId` null AND no tagged items, or `totalInclVat` null.
   - **Mixed-sign guard (review decision 2026-07-07):** weights must be usable — if any *effective site weight* ≤ 0 or `grand ≤ 0` while explicit tags exist (discount/return lines can go negative), return `{ error }` ("Line totals can't be split proportionally — use the manual split"), so the UI offers manual mode. Signed-weight math was explicitly rejected. (No tags at all → plain default fallback, not an error.)
   - Amounts: `round2(weight / grand * total)` per non-default site; **default site takes `round2(total − Σ others)`** (remainder absorbs cent rounding AND untagged weight). If there is no default site (all items explicitly tagged, invoice site null): remainder goes to the largest-weight site.
   - `source: 'items'` on every row. Drop any 0-amount non-default rows only if their weight was 0.
   - Works for negative totals (Credit Note): weights are the (positive) line sums; proportions apply to the negative total; remainder = `total − Σ others` (signed arithmetic — never a "largest row" heuristic on negatives).

3. `manualSplit(exceptions: {project_id: string; amount: number}[], defaultProjectId: string | null, totalInclVat: number | null): AllocationEntry[] | { error: string }`
   — validates: total present; no duplicate sites; exception site ≠ default site; for positive totals each amount > 0 and `Σ exceptions ≤ total` (mirror-flipped for negative totals); remainder `round2(total − Σ)` → default row (skip if remainder 0 and default null; error if remainder ≠ 0 with no default site). `source: 'manual'`.

   Return a discriminated result (or throw a typed error) — the API route (step 4) surfaces `error` as 400; the UI (step 5) shows it inline.

Invariant helper for tests + server assert: `sumsToTotal(entries, total)` → `Math.abs(round2(Σ amounts) − round2(total)) < 0.005`.

### Tests (`tests/unit/allocations.test.ts`)
- 3-way even split of 100.00 (33.33/33.33 + default 33.34) — sums exactly.
- 18 items, 3 tagged to site B → B gets grossed-up share, default the rest.
- Item sums ≠ total (e.g. items sum 88.70, total 102.00 incl VAT) — proportions of 102.00.
- All items untagged → single default row.
- No items → `deriveFromItems` falls back to default row.
- Negative total −500.00 (Credit Note) split — sums to −500.00.
- `manualSplit`: exceptions exceed total → error; exact-total exceptions with null default → ok; remainder row correct.
- Zero `line_total` items don't produce NaN.
- Mixed-sign lines: a tagged site with net-negative sum → `{ error }`; all-negative grand with tags → `{ error }`; negative discount line NOT tagged (absorbed into default weight, net still positive) → derives normally.
- `grand === 0` with explicit tags → `{ error }`; without tags → default fallback.

## Files to Create/Modify

| Action | File | Purpose |
|--------|------|---------|
| create | src/lib/allocations/split.ts | pure derive/validate + types |
| create | tests/unit/allocations.test.ts | invariant + edge-case tests |

## Done When

1. `npx vitest run tests/unit/allocations.test.ts` green; every test asserts `sumsToTotal`.
2. File has no `server-only`/supabase imports (grep it).
3. `npm run lint` clean.

## Gotchas

- Never `Σ round2(parts)` then hope — always compute the default/remainder row as `total − Σ(other rounded rows)`.
- `Number(x ?? 0)` coercion: Supabase numerics arrive as strings in some paths — coerce `line_total` on entry.
- Don't emit a `'default'`-source row from `deriveFromItems`/`manualSplit` — source reflects how the split was produced ('items'/'manual'), even for the default site's remainder row.
