---
step: 7
title: Reporting reads — site stats + register filter via allocations
status: blocked
depends: [1, 3]
plan: line-item-site-split
---

# Step 7: Per-site reads move to allocations

## Objective

Every per-site number reads `invoice_site_allocations`; whole-account numbers stay invoice-based. Register filtered by site lists invoices through allocations and shows the **allocated portion** (user decision 2026-07-07).

## Context

### Architecture
`src/lib/data.ts` — all RLS-scoped server reads (god node; this step owns it exclusively). Current per-site surfaces:
- `getProjects()` (`data.ts:162-190`): stats by summing whole `invoices.total_incl_vat` per `project_id`, approved only. Consumed by `src/app/(app)/settings/page.tsx:22` (SitesManager).
- `getInvoices()` site filter (`data.ts:55`): `q.eq("project_id", filters.projectId)`. Consumed by `src/app/(app)/invoices/page.tsx` (register + `SiteFilter`, gated by `sitesEnabled`).
- Register row rendering: `src/components/InvoiceTable.tsx` (site column shows `invoice.project?.name`).
- Dashboard `getDashboard()` (`data.ts:265-315`): whole-account — DO NOT TOUCH.
- Reports pages (`(app)/reports/*`): period-based, no site dimension today — DO NOT TOUCH.

### Database
`invoice_site_allocations(invoice_id, project_id, amount, source, user_id)`; RLS owner-scoped, so the cookie client auto-filters. After step 3, every sited invoice has rows (backfill covered history).

### Existing Patterns
Supabase embedded-filter idiom already used in this codebase: `select("*, duplicate_checks!duplicate_checks_invoice_id_fkey(count)")` + `flattenDuplicateCount` (`data.ts:71-78`) — mirror that for allocations.

### Risk
The double-count risk lives here. Rule (also in plan.md): per-site ← allocations only; account-wide ← invoices only. Supabase `!inner` embedded filter syntax: `.select("*, site_allocs:invoice_site_allocations!inner(project_id, amount)").eq("invoice_site_allocations.project_id", pid)` — if the alias/filter combination misbehaves, fall back to two queries: fetch `invoice_id, amount` from allocations for the project, then `.in("id", ids)` on invoices and stitch amounts in JS (200-row register page, fine).

## Implementation

1. **`getProjects()`**: replace the invoices aggregate with
   `from("invoice_site_allocations").select("project_id, amount, invoice:invoices!inner(status)")`,
   sum `amount` and count rows where `invoice.status === 'approved'`. (`count` semantic shifts from "invoices" to "invoices touching this site" — same thing for unsplit rows; a split invoice counts once per site it touches. Note it in the function docblock.)
2. **`getInvoices()`** when `filters.projectId`: use the inner-join filter (or fallback) and attach `allocated_amount: number` to each returned row (the allocation's amount for that project). Extend the return type (`InvoiceWithSupplier & { allocated_amount?: number }` — add optional field on the type in `types.ts` or a local intersection).
3. **`getInvoice()`** (`data.ts:80-101`): also return `allocations` (used by review page, step 5).
4. **`InvoiceTable.tsx`**: when rows carry `allocated_amount` differing from `total_incl_vat`, amount cell renders the allocated portion with a muted `of R{total}` suffix; unfiltered view unchanged, plus a subtle "+N" indicator on the site column when an invoice has >1 allocations (data available from an allocations count embed — piggyback the same select).
5. Register totals/footers (if any sum is rendered on the filtered page) must sum `allocated_amount`.

## Files to Create/Modify

| Action | File | Purpose |
|--------|------|---------|
| modify | src/lib/data.ts | getProjects, getInvoices, getInvoice via allocations |
| modify | src/lib/types.ts | allocated_amount optional field / allocations on getInvoice result |
| modify | src/components/InvoiceTable.tsx | allocated-portion cell + multi-site indicator |
| modify | src/app/(app)/invoices/page.tsx | thread allocated amounts if page-level totals exist |

## Done When

1. Settings → Sites total spend for a site = Σ allocation amounts of approved invoices (verify with one split invoice: the two sites' totals move by the split amounts, together equal the invoice total).
2. Register filtered by Site B lists a split invoice and shows R{Site B share} `of R{total}`; unfiltered register unchanged.
3. Dashboard numbers identical before/after (no allocations in that path).
4. `npm test` + `npm run build` pass.

## Gotchas

- Invoices with `project_id` set but a null/0 total have 0-amount allocations (step 1 backfill) — they must still appear in the filtered register (inner join includes them) and count in invoice_count.
- RLS embeds: `invoices!inner(status)` respects invoice RLS automatically — no user filter needed (CLAUDE.md: don't add manual owner filters on RLS reads).
- Don't rename `project:projects(*)` embeds — `InvoiceTable`/`csv.ts` read `i.project?.name`.
- Numeric-as-string: `Number(amount)` before summing.
