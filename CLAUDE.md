@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Next.js 16** — the imported `AGENTS.md` warns this version has breaking changes vs. training data. Read the relevant guide under `node_modules/next/dist/docs/` before writing App Router / API / config code. Async `params`/`searchParams`/`cookies()`/`headers()` are the norm here.

## Stack decision (overrides the PRD)

`invoice_ocr_app_prd_v2.md` is the **source of truth for scope, data model, domain rules, and design** — but it recommends a Python/Streamlit/SQLite stack. We deliberately build instead on **Vercel + Supabase**:

| PRD says | We use |
|---|---|
| Streamlit UI | **Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4** |
| SQLite → Postgres | **Supabase Postgres** (`supabase/migrations/`) |
| Local file storage | **Supabase Storage** (`invoices` bucket) |
| Python `InvoiceProcessor` | **TS extraction engine** in `src/lib/extraction/`, provider-abstracted |
| Tesseract baseline | Optional later; **OpenAI Vision is the primary extractor** |
| Celery/Redis queue | Next.js API routes / Vercel functions; durable queue later if needed |

Deploy target: **Vercel**. Repo: `git@github.com:yourdesigncoza/invoice-ocr.git`.

When the PRD's module names (`processor.py`, `vision_extractors.py`, etc.) come up, map them to their TS equivalents below rather than creating Python files.

## What this product is

**SpendSilo** (brand guidelines: `docs/brand-guidelines.md`). Not an OCR tool — an invoice **intelligence** layer. Extraction is the front door; the value is supplier grouping ("silos"), duplicate detection, VAT validation, and time-based spend reporting (day/week/month/quarter/year). Market is South African: default currency `ZAR`, VAT-centric.

The MVP is strictly **human-assisted**: extract → confidence-score → human reviews side-by-side with the original image → only **approved** records are trusted. Dashboards default to approved invoices only. Never auto-approve on raw extraction output.

## Security & auth status — multi-tenant SaaS

**The product pivoted from single-tenant to multi-tenant** (this overrides the
old PRD §5 single-tenant model). Each user signs up (email + password, email
confirmation on), logs in, and owns their **own private** invoices / suppliers /
sites; **John (`ADMIN_EMAILS`) is the sole super-admin** managing user accounts
only (not their data).

How it's enforced (do NOT regress to service-role-everywhere):
- **Auth gate (Phase 1, done):** Next 16 `src/proxy.ts` (renamed middleware)
  refreshes the session + redirects to `/login`; `(auth)` route group
  (login/signup/forgot/reset + `/auth/callback`); `src/lib/auth-guards.ts`
  (`getUser`/`requireUser`/`isAdminEmail`/`requireAdmin`).
- **Per-user isolation (Phase 2, done):** every owned table has a
  `user_id uuid → auth.users` column; RLS is `user_id = auth.uid()` (migration
  `0006_multitenant.sql`); Storage objects live under `${userId}/…` with
  path-prefix Storage policies.
- **Admin (done):** `/admin` gated by `isAdminEmail` — lists auth users with
  reset-password / delete (account management only, never invoice data). Routes
  under `src/app/api/admin/users/*` (404 to non-admins).
- **Client rules:** reads + interactive route handlers use the cookie-bound
  **`createServerSupabase()`** (RLS auto-scopes to the caller — this is the IDOR
  protection; don't add manual `owner_id` filters on top). The **only** legit
  `createAdminSupabase()` uses are: the extraction pipeline's background `after()`
  work (no session post-response — it stamps `user_id` explicitly), and admin
  account management (`svc.auth.admin.*`). Background/admin queries that touch
  tenant data MUST filter by `user_id` (e.g. `findDuplicates`).
- **Before public deploy:** open signup spends the OpenAI budget — add a per-user
  upload rate-limit / Vercel BotID; enable Supabase "leaked password protection";
  set `ADMIN_EMAILS` + the Supabase/OpenAI env vars on Vercel.

## Commands

```bash
npm run dev          # local dev server (restart after editing proxy.ts or env vars)
npm run build        # production build (run before pushing — also regenerates
                     #   .next/types, needed when adding a new route handler)
npm run lint         # eslint
npm test             # vitest (unit + integration); single file: npx vitest run path/to.test.ts
                     #   tests/integration/pdf-extract.smoke.test.ts hits the real
                     #   OpenAI API (skips itself when OPENAI_API_KEY is unset)

# Extraction quality (eval/ — see eval/README.md):
python3 eval/compare_models.py --models gpt-4o,gpt-5.4-mini   # model agreement diff
python3 eval/score_models.py --models gpt-4o                  # accuracy vs labels.json gold set
python3 eval/portal/build.py --model gpt-4o                   # rebuild human verification portal
```

Migrations: the Supabase MCP can apply DDL/DML directly (`apply_migration` /
`execute_sql`, project ref `kitbiplhdoabmvnrlgxa`); keep the `.sql` file in
`supabase/migrations/` in sync with what's applied.

Env vars live in `.env.local` (see `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only), `OPENAI_API_KEY` (server only), `OPENAI_VISION_MODEL`, `ADMIN_EMAILS` (comma-separated super-admins).

## Architecture

```
src/
  proxy.ts                  # Next 16 "middleware" (renamed) — session refresh + auth gate
  app/
    (auth)/                 # login / signup / forgot / reset (public route group)
    auth/callback/          # PKCE code exchange (email confirm + recovery)
    (app)/                  # gated app: dashboard, upload, review, invoices, suppliers,
                            #   duplicates, reports, exports, getting-started,
                            #   settings (currency + sites + account), admin
    api/                    # route handlers: extract, invoices/[id], uploads/status,
                            #   export, projects, settings, admin/users/*
    manifest.ts             # PWA web-app manifest (installable to phone home screen)
  components/               # UI: sidebar, status/duplicate/paid badges, tables, review pane,
                            #   AuthForm, modals, SitesManager, AdminUsersClient, CurrencyCard,
                            #   InstallPrompt + ServiceWorkerRegister (PWA)
  lib/
    auth-guards.ts          # getUser / requireUser / isAdminEmail / requireAdmin
    constants.ts            # single source of truth (DRY) for domain enums, statuses,
                            #   currencies, upload MIME/size limits, nav, status colors —
                            #   DB enums, Zod schema, and UI all import from here
    pwaInstall.ts           # captures beforeinstallprompt for the install banner
    supabase/               # server.ts (createServerSupabase = cookie/RLS + createAdminSupabase
                            #   = service role), client.ts (browser)
    data.ts                 # all server reads (RLS-scoped via createServerSupabase)
    extraction/             # the engine — provider-abstracted
      schema.ts             # Zod invoice schema = the extraction contract
      provider.ts           # ExtractionProvider interface (+ TokenUsage)
      prompt.ts             # the extraction prompt
      preprocess.ts         # image preprocessing before the vision call
      openai-vision.ts      # primary provider (default model gpt-4o; PDFs sent natively)
      validate.ts           # business-rule validation (PRD §7.3.2)
      confidence.ts         # field + document scoring + deterministic ceiling
    image/compress.ts       # client-side downscale/compress before upload
    allocations/            # multi-site split: split.ts (pure math, client-safe),
                            #   sync.ts (server: replaceAllocations + invoice-write sync)
    suppliers/matching.ts   # multi-signal supplier matching (pass an RLS-scoped client)
    duplicates/detect.ts    # duplicate scoring (user-scoped probe)
    export/                 # CSV builders
supabase/migrations/        # SQL schema (0001 init … 0006 multitenant, 0007 user_settings,
                            #   0008 admin_user_stats, 0009 credit-note doctype, 0010 token usage,
                            #   0011 site allocations + item site tags)
public/                     # static assets + PWA: sw.js (offline shell), offline.html, icons/
eval/                       # accuracy harness vs hand-labelled gold set (labels.json gitignored)
  portal/                   # standalone human verification portal (build.py, seal.mjs) —
                            #   deployed encrypted+passcode-gated to spendsilo-verify.vercel.app
tests/                      # vitest unit + integration tests + sample_invoices/ fixtures
docs/                       # brand-guidelines, extraction-pipeline-review (settled decisions),
                            #   extraction-strategy-analysis (LlamaIndex verdict: don't replace)
```

**PWA:** the app is installable. `app/manifest.ts` + `public/icons/` (note: the
**maskable** icon needs safe-zone padding — Android zooms it), `public/sw.js` is
a minimal offline shell that **never caches `/api`, authenticated HTML, or
Supabase signed URLs**, and `ServiceWorkerRegister` (root layout) registers it
**in production only**. `InstallPrompt` is a mobile-only floating bottom banner
(`md:hidden`, mounted once in `(app)/layout.tsx`). `proxy.ts`'s matcher must
exempt `sw.js` + `offline.html` so they stay publicly fetchable.

The extraction engine is **provider-abstracted from day one** — one entry point regardless of backend, mirroring the PRD's `processor.process_invoice(file, schema, provider)`. Pipeline (each stage discrete so a regression is isolatable):

```
Upload → File Validation → (Preprocessing) → Vision/LLM Structured Extraction →
Zod Schema Validation → Business Rule Validation → Confidence + Warnings →
Human Review Queue → Approved Invoice Record
```

**Upload → extract runtime shape** (easy to break — see `docs/extraction-pipeline-review.md`):
- The client compresses images (`lib/image/compress.ts`) and **chunks multipart
  POSTs under Vercel's 4.5 MB body limit** (`MAX_UPLOAD_BYTES`); accepted
  types/sizes are guarded client-side *and* on ingest via `ACCEPTED_UPLOAD_TYPES`.
- `api/extract` is **two-phase**: Phase 1 stores originals + creates
  `document_uploads` rows and responds; Phase 2 runs in `after()` (maxDuration
  300s) with **bounded concurrency** across the batch. The uploads status
  endpoint **reaps stranded rows** (processing >10 min → `failed`), so never
  assume a `processing` row still has a live worker.
- Per-document **token usage** is recorded on `extraction_logs`
  (prompt/completion/total, migration 0010) for OpenAI cost tracking.

**Settled decisions — do NOT re-open** (`docs/extraction-pipeline-review.md`):
**gpt-4o is the chosen model** — it beat gpt-5.4/5.4-mini/5.5 on a 34-row
human-verified gold set (the gpt-5.x reasoning models hallucinate values where
`null` is correct). PDFs go to gpt-4o **natively** (base64 file content part),
not via rasterization. No SA-specific VAT-number checksum validator (app may
run in other countries). LlamaIndex/LlamaParse was evaluated and rejected as a
replacement (`docs/extraction-strategy-analysis.md` — borrow ideas, don't swap).

## Extraction contract (non-negotiable — PRD §7.3.1/§7.3.2)

Correctness requirements, not style:
- Reject malformed extraction output **before** it reaches the review queue (Zod-validate).
- `null` for unknown fields — never invent values. Money = numbers, not strings. Dates → ISO `YYYY-MM-DD`.
- Keep the original detected value alongside any normalized value; store raw OCR/model text separately from structured JSON (`extraction_logs`).
- Confidence at document **and** important-field level; warnings as an array. The document score is **capped by deterministic evidence** (`confidence.ts`): model self-confidence never outranks the pipeline's own arithmetic — VAT that doesn't reconcile or missing supplier+date forces a ceiling below `medium`. Conversely a clean receipt that simply has no VAT is *not* forced to `low_confidence`.
- Persist both `original_file_path` and `processed_file_path`; the original is never mutated.
- Deterministic checks after extraction: total exists; date/supplier/invoice-number presence flagged; VAT reconciles when subtotal+VAT present; currency is stamped from the user's `default_currency` setting (overrides detection); negative totals rejected unless credit note/refund; outlier totals flagged; duplicate risk computed before approval. Failures become plain-language warnings on the review screen. The non-actionable *"VAT rate not clearly detected"* warning is filtered out post-extraction (`filterNoiseWarnings` in `validate.ts`) — SA VAT is a flat 15%, so an unclear rate is never actionable.

## Domain logic that's easy to get wrong

- **Supplier matching** is multi-signal, not just fuzzy string: exact → normalized → fuzzy → VAT number → phone → address → historical user-approved matches. **Silos materialise automatically on approval** (`resolveSupplierOnApproval`): a match scoring ≥ `AUTO_LINK_THRESHOLD` (0.9 — VAT/phone/normalized-name/strong-fuzzy) auto-links; anything weaker creates a new silo (a wrong merge silently corrupts spend-per-supplier; a near-duplicate silo is visible and re-linkable). The reviewer's manual link/create box always overrides. `normalize_supplier_name()` in Postgres (migration 0012) is the SQL twin of `normalizeName()` — change them together or backfilled silos stop exact-matching. Same supplier recurs under inconsistent names ("SPAR", "Hartenbos Spar & Tops", "Retail Spar Hartenbos") and across branches. Store `original_supplier_name` on the invoice; link to a normalized supplier silo (`parent_supplier_id` for branches).
- **Duplicate detection** is **system-driven, not a manual action** (no "mark duplicate" button/status). Computed at upload (`findDuplicates`, user-scoped): match on linked `supplier_id` *or* normalized `original_supplier_name` (so it fires before a silo is linked) + `Total`, then `Invoice Number + Date` (primary) or `Date` (fallback). Matches are written to `duplicate_checks`; the UI **highlights** flagged invoices (badge + upload toast) and the reviewer **Accepts (approve) or Deletes**. `reject` and a (removed) "not an invoice" are the same disposition — only `reject` remains.
- **VAT** is often missing/unclear on thermal slips/informal receipts — absence is a flag, not an error. Don't assume a tax invoice has clean VAT. (SA VAT is a flat 15%; a configurable default-rate feature is a planned follow-up — see project memory.)
- **Document types**: Tax Invoice / Receipt / Cash Sale / Credit Note / Purchase Notice / Prepaid Electricity / Statement / Unknown / Not Invoice — drives VAT and reporting behavior. The canonical list is `DOCUMENT_TYPES` in `src/lib/constants.ts`; adding one also needs a DB enum migration (see 0009). ("Not Invoice" is a *document type*, distinct from the removed `not_invoice` status.)
- **Sites (projects)** are an **adaptive** dimension: the picker/column/filter only appear once a user has **≥2 active sites** (0–1 → the app looks exactly as before). Assign a batch at upload, correct in review/modal; "remove" = **archive** (invoices keep their history).
- **Multi-site split** (migration `0011`): one invoice's total can be allocated across sites. `invoices.project_id` = the **default site**; `invoice_site_allocations` = the **source of truth for per-site amounts** (a sited invoice always has ≥1 row; the extract pipeline and PATCH route keep it in sync via `lib/allocations/sync.ts`). Split UX is **default-plus-exceptions**: tag only the exception line items (`invoice_items.project_id`, null = default site); amounts come from **proportional gross-up** — item sums are *weights* applied to `total_incl_vat`, cent remainder to the default site, so allocations reconcile to the total by construction (`lib/allocations/split.ts`, pure + client-safe — the review preview and the persisted values are the same function; never reimplement the math). Mixed-sign item weights (discount lines) **refuse** derivation → manual rand-amount fallback. **Cardinal rule: per-site numbers read allocations only; whole-account numbers (dashboard) read invoices only** — mixing double-counts splits. Allocation writes go through `replaceAllocations()` (upsert-then-delete-strays, never delete-then-insert — no transactions in supabase-js) and every `project_id` write is ownership-validated (plus a DB tenant trigger, since the extract path uses the service-role client).

## Data model

PRD §11. Core tables: `suppliers` (+`parent_supplier_id`), `invoices`, `invoice_items`, `document_uploads`, `extraction_logs` (raw + extracted + validated JSON + provider/model + warnings), `extraction_fields` (per-field raw/normalized/confidence/correction audit), `duplicate_checks`, `audit_logs`, and `projects` (= "sites", a cost-centre dimension on `invoices.project_id`). Approved financial records are never silently deleted; manual corrections are audit-logged.

**Admin stats:** the `/admin` per-user usage numbers come from a
`security definer` function (migration 0008) that returns **aggregate counts
only** (invoices, uploads, bytes, tokens, last activity) — it deliberately stops
at the privacy boundary (admin manages accounts, never tenant invoice content)
and is executable by `service_role` only. Keep any admin-facing addition on that
side of the line.

**Multi-tenant:** every owned table carries `user_id uuid → auth.users` with RLS `user_id = auth.uid()` (migration `0006`); set `user_id` on **every** insert. The `invoice_status` enum still contains the retired `duplicate` and `not_invoice` values (Postgres can't drop enum values in place) — they're **inert**: don't reintroduce them. Live statuses are `processing / needs_review / approved / rejected / low_confidence`.

**Per-user settings:** `user_settings` (migration `0007`; `user_id` PK, `default_currency`, RLS owner-scoped) holds preferences, created lazily — `getUserSettings()` falls back to app defaults when absent. It's the home for future per-user prefs (e.g. the deferred VAT default-rate). **Currency is a per-user default, not a per-invoice field:** the review screen no longer edits it; the extract pipeline stamps each new invoice with the user's `default_currency`, overriding model detection (existing invoices keep their recorded currency). **Payment status:** the pre-existing `payment_status` enum (`Paid/Unpaid/Unknown/COD/Account`) is now surfaced — a "Paid" checkbox in review (defaults checked; maps Paid/Unpaid) plus a Paid/Unpaid badge and an "Outstanding" register filter.

## Testing & extraction quality

Quality is measured **field-by-field against a gold-standard set** of 30–50 hand-labeled real invoices, not unit tests alone. The harness lives in `eval/` (`compare_models.py` for model agreement, `score_models.py` for accuracy vs `labels.json`; both mirror the exact production prompt/schema/preprocessing). Ground truth is human-verified through the standalone portal in `eval/portal/` (`build.py` regenerates it; `seal.mjs` produces the encrypted deploy at spendsilo-verify.vercel.app). **Label only what's readable on the image** — a cropped-off supplier name is `null`, not the name you happen to know. Gold set stands at 92% with all targets met (2026-06-11). MVP accuracy targets *before human correction* (PRD §12.1): supplier 85%+, total 90%+, date 80%+, doc-type 80%+, VAT-where-present 75%+, obvious duplicates 90%+. **Regression rule:** any change to extraction prompt/schema/preprocessing/provider must re-run `eval/score_models.py` against the full gold set spanning all hard cases (thermal slips, A4 tax invoices, cropped/skewed WhatsApp photos, purchase notices, missing-VAT receipts, repeat suppliers, handwriting). Don't fix one document type while regressing another.

## UI direction

"Airtable structure + Xero polish + modern AI tool clarity." Light off-white workspace `#F8FAFC`, dark navy sidebar `#0F172A`, white cards, primary action blue `#2563EB`. Fixed semantic status colors: Approved `#16A34A`, Needs Review `#F59E0B`, Low Confidence `#DC2626`, Duplicate `#EA580C`, Processing `#3B82F6`, Rejected `#6B7280`. Invoice register = Airtable-style filterable table; review screen = split-pane (original image left, editable fields right). Font: Inter. Full palette/screens in PRD §9–§10.
