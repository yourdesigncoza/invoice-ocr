# Adversarial review — line-item-site-split plan · depth max · Grok + Codex (Gemini skipped)

Reviewed: `brief.md`, `plan.md`, sections 03/04/07 (payload). Sections 01/02/05 consulted during adjudication (reviewers did not see step-02, which pre-answered several "underspecified math" claims — those were adjudicated against the full plan, not just the payload).

- **Grok** (`x-ai/grok-4.20`): full report, verdict DO-NOT-SHIP (pre-adjudication).
- **Codex**: 10 findings + missing-steps list, no explicit verdict.
- **Gemini**: skipped — MCP backend migrated to Antigravity CLI (`agy`), not installed on this machine.

## Confirmed findings (consensus-ranked, post-adjudication)

| # | Sev | Location | Issue | Caught by | Resolution |
|---|-----|----------|-------|-----------|------------|
| 1 | HIGH | step-03/04 | Delete-then-insert allocation replacement + no transactions: crash after delete = invoice with zero rows, silently vanishing from per-site reads | Grok, Codex | **Fixed in plan**: shared `replaceAllocations()` = upsert-then-delete-strays; worst case = stale extra row (visible, repairable); step-9 SQL invariant sweep is the net |
| 2 | HIGH | step-04 (+extract route) | `project_id` ownership validated only in split handling — plain `linkProjectId` PATCH and the upload `projectId` accept forged/foreign ids (pre-existing gap, widened by allocations) | Codex | **Fixed in plan**: ownership preflight on EVERY `project_id` write (step-03 wire-up 0 for upload; step-04 preflight for PATCH) |
| 3 | HIGH | step-04 | Non-atomic PATCH ordering: split validation failing AFTER the invoice update commits leaves half-applied state | Codex | **Fixed in plan**: full preflight (ownership + in-memory derivation) before any write; single audit insert last, recording actual outcome |
| 4 | MEDIUM | step-03 | Rescale-on-total-change drifts from item tags over repeated edits; re-point-default-row rule can disagree with `null`-tag semantics | Grok (as HIGH), Codex | **Fixed in plan** (user decision): `source='items'` splits re-derive from persisted tags (total AND default-site changes fall out correctly); only `source='manual'` rescales, with `old_sum===0` guard |
| 5 | MEDIUM | step-02 | Mixed-sign line weights (discount/return lines): negative or >100% site shares possible; negative-total remainder wording ("largest") wrong under sign flip | Grok, Codex | **Fixed in plan** (user decision): derivation refuses when any site weight ≤ 0 or grand ≤ 0 with tags present → UI offers manual fallback; remainder is signed arithmetic, no "largest" heuristic |
| 6 | MEDIUM | step-01 | RLS on allocations doesn't ensure invoice/project/allocation share a tenant; admin client bypasses RLS in extract path | Codex | **Fixed in plan** (user decision): `trg_isa_tenant` BEFORE INSERT/UPDATE trigger in migration 0011 |
| 7 | LOW | step-04 | Two writers per request when `linkProjectId` + `split` both arrive (sync then split) | Grok (as part of HIGH #1) | **Fixed in plan**: skip sync when a split payload is present in the same request |

## Adjudications (material splits, ruled against ground truth)

| Split | Type | Evidence / steelman | Ruling |
|-------|------|---------------------|--------|
| Grok HIGH "step-3 sync FIGHTS step-4 split in the same request → inconsistent state" | Factual | Step-4 text orders them sequentially; split replaces sync's output — no in-request race. The *drift* complaint (finding 4) is the real content | Overruled as stated; substance folded into finding 4 (MEDIUM) |
| Grok HIGH "admin client insert never shown using invoice.user_id → cross-tenant leak" | Factual | Step-3 explicitly states "Every insert sets `user_id: invoice.user_id`"; helper signature carries it | False positive; kept the cheap hardening anyway (`replaceAllocations` *requires* userId + DB trigger) |
| Grok MEDIUM "single-site tenants get allocation rows the UI never expects" | Factual | By design: allocations mirror `project_id` for ALL sited invoices; per-site sums equal today's values exactly; UI gating is `projectsEnabled()` (≥2), unchanged | False positive — backfill is the point (single code path, no per-tenant branching) |
| Grok "getProjects semantics shift will move existing customers' totals at deploy" | Factual | Backfill amount = `coalesce(total,0)` = exactly what `getProjects` sums today; no splits exist at deploy; counts identical for unsplit invoices | False positive; docblock note (already planned in step-07) suffices |
| Codex HIGH "zero-weight cases undefined" | Factual | Step-02 (not in payload) already defined `grand===0`/no-items fallbacks; the *rescale* `old_sum===0` case in step-03 WAS undefined | Partially upheld → folded into findings 4/5 as MEDIUM |
| Grok "rescale vs leave-splits-alone" vs Codex "re-derive from tags" | Judgment | Leave-alone breaks the sum invariant on total edits; rescale drifts; re-derive is reproducible because tags persist (manual splits have no basis → rescale) | User chose **re-derive from tags** (Codex's line), 2026-07-07 |

## Unconfirmed (single-source / not actioned)

- Grok: "allocations should be disallowed on rejected invoices" — per-site reads already filter `status='approved'` (step-07); rejected invoices' rows are inert. No change.
- Grok: audit-log JSONB growth from `site_split` snapshots — negligible at this scale.
- Codex LOW: `source` ambiguity on the remainder row — step-02 gotcha already mandates all rows in a split share the split's source; no change needed.
- Codex: race between project-ownership preflight and insert (project archived/deleted mid-request) — accepted residual risk at this scale; DB trigger catches the cross-tenant variant.

## Verdict: SHIP-WITH-FIXES → fixes applied to the plan

Grok's DO-NOT-SHIP rested partly on two overruled findings (in-request sync/split fight; user_id stamping omission); the surviving consensus HIGHs (1–3) and MEDIUMs (4–6) all had concrete plan-level fixes, which are now folded into sections 01–05 and plan.md (risk table updated). Bucket B decisions (re-derive vs rescale; refuse-mixed-sign vs signed math; DB trigger) were put to the user 2026-07-07 — all three recommended options accepted. Gemini was skipped (backend unavailable).

**Plan status: approved for execution** — run `/ydcoza-plan execute line-item-site-split` in a fresh session.

## Codex finding traceability (all 10 + missing-steps list)

| Codex # | Claim | Disposition |
|---------|-------|-------------|
| 1 (HIGH) | project_id validation too narrow (upload + plain PATCH unvalidated) | **Upheld** → confirmed finding 2; fixed in step-03 wire-up 0 + step-04 preflight |
| 2 (HIGH) | delete→insert can permanently break the invariant | **Upheld** → confirmed finding 1; fixed via `replaceAllocations` upsert-then-delete-strays. Codex's alternative remedy (Postgres RPC transaction) noted below |
| 3 (HIGH) | PATCH not atomic when fields + split co-arrive | **Upheld** → confirmed finding 3; full preflight before any write |
| 4 (HIGH) | zero-weight / zero-old-sum undefined | **Partially upheld** → `grand===0` was already defined in step-02 (not in payload); the `old_sum===0` rescale guard WAS missing — added to step-03. Folded into findings 4/5 |
| 5 (MED) | signed/negative weights unspecified | **Upheld** → confirmed finding 5; refuse + manual fallback (user decision) |
| 6 (MED) | rescale drifts from item tags | **Upheld** → confirmed finding 4; re-derive from tags (user decision) |
| 7 (MED) | default-site change leaves item tags semantically stale | **Upheld, absorbed** → re-derive-from-tags makes `null`-tags follow the new default automatically; no separate fix needed |
| 8 (MED) | RLS alone doesn't ensure invoice/project/allocation tenant match | **Upheld** → confirmed finding 6; `trg_isa_tenant` trigger (user decision) |
| 9 (MED) | audit ordering can lie about split failures | **Upheld, absorbed into finding 3** → single audit insert, last, recording the actual outcome; partial-failure repair documented (sync + step-9 sweep) |
| 10 (LOW) | `source` of the remainder row ambiguous | **False positive** (payload scope) — step-02 gotcha already mandates all rows in a split share the split's source |

Missing-steps list: preflight validation phase → adopted (step-04). Transactional RPC **or** accept-and-repair → chose accept-and-repair (upsert-order + step-9 SQL sweep); a plpgsql `replace_allocations()` RPC called via `supabase.rpc()` would give true atomicity and remains a clean upgrade path if the repair window ever bites in practice — deliberately not taken now to keep migration 0011 lean. Adversarial test list → distributed into steps 2/3/4/5 Done-When items (forged ids, mixed signs, negative totals, default-site change with tags, single-site legacy flows); the insert-failure-after-delete case is obsoleted by the upsert order.

---

# Implementation review — consolidated Grok + Codex pass (2026-07-07, post-build)

One adversarial pass over the full working-tree change (per-step diffs impossible without commits, which are user-gated). Payload: `git diff HEAD` + full new files.

## Confirmed → fixed

| Sev | Finding | Caught by | Fix |
|-----|---------|-----------|-----|
| HIGH | `body.fields` spread unchecked into the invoice update — `fields.project_id` (or `user_id`/`status`) bypassed the ownership preflight | Codex | `EDITABLE_FIELDS` allowlist in PATCH; identity/workflow columns only writable via their checked paths |
| MEDIUM | Unsited invoice + partial item tags: untagged share folded into the largest *tagged* site (B=10 tagged of 100 → B persisted as 100) | Codex | `deriveFromItems` refuses ("assign a site or tag every line"); regression test added |
| MEDIUM | Allocation-write failure after the invoice update committed returned 400 with **no audit record** of the partial write | Codex | Audit record (with `site_split_error`) written before the 400 |
| LOW | Unquoted UUIDs in the PostgREST `not.in.(...)` cleanup filter | Grok (as HIGH) | Quoted defensively. Codex adjudicated Grok's HIGH down: "UUIDs likely parse; no definite quoting bug" |

## Overruled / accepted-risk

- **Grok HIGH "delete still runs when upsert fails"** — false: `replaceAllocations` throws on upsert error before the delete.
- **Grok MEDIUM "clear-mode force-clears tags" / "invoice_items has no RLS" / "UUID probing" / "backfill misses pre-migration splits"** — all false: clear-mode nulling is the spec; `invoice_items` carries owner RLS from 0006; the 400 doesn't distinguish missing vs foreign (anti-probe); splits cannot predate the table.
- **Codex MEDIUM "clearing the site deletes all allocations"** — by design: unsited invoices have no allocations and don't participate in per-site reads (dashboard reads invoices).
- **Both: no transactions (partial-write windows), stale-manual-row corner** (upsert ok → delete fails → user ignores the 400 → later total edit legitimizes the stale row) — accepted residual, documented; a `replace_allocations()` plpgsql RPC is the recorded upgrade path if it bites in practice.
- **Grok "register CSV total_incl_vat column double-counts when summed across fan-out rows"** — inherent to the user-chosen per-allocation export shape; `site_amount` is the summable column (documented in `invoicesToRows`).

## Verdict: SHIP-WITH-FIXES → fixes applied

Grok's DO-NOT-SHIP rested on the quoting claim (overruled by Codex + hardened anyway) and the no-transaction design (accepted at plan review). Codex's genuine HIGH (fields allowlist) and MEDIUMs are fixed. Gates after fixes: 72 unit tests green, tsc clean, `npm run build` OK.

## Decision table

| # | Finding | Category | Action Taken | Impact |
|---|---------|----------|--------------|--------|
| 1 | Delete-then-insert crash window | Reliability | step-03/04: `replaceAllocations` upsert-then-delete-strays | High |
| 2 | Unvalidated `project_id` writes (upload, plain PATCH) | Security | step-03 wire-up 0 + step-04 preflight | High |
| 3 | Non-atomic PATCH (validate-after-write) | Correctness | step-04: full preflight before any mutation; audit last | High |
| 4 | Rescale drift on items splits | Correctness | step-03: re-derive from tags (user-approved) | Medium |
| 5 | Mixed-sign weights / negative-total remainder | Correctness | step-02 guard + refusal→manual fallback (user-approved); step-05 UI path | Medium |
| 6 | Tenant integrity vs service-role writes | Security | step-01: `trg_isa_tenant` trigger (user-approved) | Medium |
| 7 | Dual writers when split + linkProjectId co-arrive | Correctness | step-04 gotcha: skip sync when split present | Low |
