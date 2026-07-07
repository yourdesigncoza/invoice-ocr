---
plan: line-item-site-split
status: completed
started: 2026-07-07
model-execute: fable-5
git-hash-at-plan: 11d15edc35925db05ccd932954954ab8cd080106
codex_per_step: false
---

# Progress: Line-item site split (multi-site invoice allocation)

> Executed in the planning session at the user's explicit request ("Implement
> the plan"), overriding the fresh-session rule. Per-step Codex review replaced
> by ONE consolidated Grok+Codex adversarial pass at the end — per-step diffs
> can't be isolated without commits, and git ops are user-gated in this repo.

## Status

| # | Step | Status | Started | Completed | Notes |
|---|------|--------|---------|-----------|-------|
| 1 | Migration 0011: allocations table + item site column + backfill | ✅ done | 2026-07-07 | 2026-07-07 | Applied via MCP; backfill 6/6; tenant trigger verified rejecting mismatched user_id |
| 2 | Allocation domain lib (pure derive/validate) + unit tests | ✅ done | 2026-07-07 | 2026-07-07 | 22 unit tests green |
| 3 | Default-allocation sync in write paths | ✅ done | 2026-07-07 | 2026-07-07 | sync.ts + extract route (ownership check + default alloc) |
| 4 | Split API: item tags + manual split on invoices PATCH/GET | ✅ done | 2026-07-07 | 2026-07-07 | preflight-before-write; GET returns allocations |
| 5 | Review UI: per-line site tags, live summary, manual fallback | ✅ done | 2026-07-07 | 2026-07-07 | SiteSplitEditor (shared component) |
| 6 | Invoice modal: split breakdown + edit | ✅ done | 2026-07-07 | 2026-07-07 | read-mode chips + edit-mode editor |
| 7 | Reporting reads: site stats + register filter via allocations | ✅ done | 2026-07-07 | 2026-07-07 | data.ts + InvoiceTable ("of R total", +N badge) |
| 8 | CSV export: one row per allocation | ✅ done | 2026-07-07 | 2026-07-07 | site_amount column; VAT summary untouched |
| 9 | End-to-end verify + docs close-out | ✅ done | 2026-07-07 | 2026-07-07 | Playwright e2e on prod server: tag→preview→approve→register/stats/export all agree; invariant sweep 0 violations; audit row carries site_split |

## Legend

- ⏳ `blocked` — waiting on dependencies
- 🟢 `ready` — all dependencies met, can start
- 🔄 `in-progress` — currently being implemented
- ✅ `done` — implemented and verified
- ❌ `failed` — step failed during execution (see completion log for error)
- ⏭️ `skipped` — intentionally not done (satisfies downstream deps)

## Completion Log

| # | Completed | Summary |
|---|-----------|---------|
| 2 | 2026-07-07 | `lib/allocations/split.ts` + 22 tests (rounding, credit notes, mixed-sign refusal, degenerates) — all green |
| 3 | 2026-07-07 | `lib/allocations/sync.ts` (re-derive items / rescale manual / replaceAllocations upsert-then-delete-strays); extract route Phase 1 ownership check + Phase 2 default allocation |
| 4 | 2026-07-07 | PATCH: full preflight (ownership + in-memory derivation) before any write; split modes items/manual/clear; single audit record incl. site_split; GET + allocations |
| 5 | 2026-07-07 | `SiteSplitEditor.tsx` — same pure math client-side; refusal→manual fallback path; replaced ReviewClient's static items table |
| 6 | 2026-07-07 | InvoiceModal: allocation chips (read) + SiteSplitEditor (edit), save wired |
| 7 | 2026-07-07 | getProjects/getInvoices/getInvoice via allocations; register shows allocated portion + split badge |
| 8 | 2026-07-07 | invoicesToRows per-allocation fan-out + tests; export route passes allocations (register export only) |
| — | 2026-07-07 | Gates: `npm test` 71 passed, `npx tsc --noEmit` clean, `npm run build` OK, lint clean (2 pre-existing warnings in untouched files). Gold-set re-run NOT required (no extraction prompt/schema/preprocess change) |

## Close-out (2026-07-07)

**PLAN COMPLETE.** Migration applied (backfill 6/6, invariant sweep 0 violations, tenant
trigger verified). Playwright e2e against a production build: seeded test user
(`e2e-split-test@spendsilo.local`, 2 sites, 1 needs-review invoice with 3 items) — tagged
the R100 cement line to Jones Renovation, live preview showed the exact gross-up
(R115/R115, 50/50 of the R230 total), Approve persisted two `items` allocations of R115,
filtered register showed "R115,00 of R230,00" + split badge, site stats showed R115 each,
CSV export fanned out to 2 rows with site_amount 115/115, audit row carries `site_split`,
item tag persisted. Code review: Grok+Codex synthesized in review.md; 4 findings fixed;
73 unit tests green.

Test tenant left in place for manual poking (delete via /admin when done):
`e2e-split-test@spendsilo.local` (password shared out-of-band in the session).
