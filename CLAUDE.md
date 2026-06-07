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

Not an OCR tool — an invoice **intelligence** layer. Extraction is the front door; the value is supplier grouping ("silos"), duplicate detection, VAT validation, and time-based spend reporting (day/week/month/quarter/year). Market is South African: default currency `ZAR`, VAT-centric.

The MVP is strictly **human-assisted**: extract → confidence-score → human reviews side-by-side with the original image → only **approved** records are trusted. Dashboards default to approved invoices only. Never auto-approve on raw extraction output.

## Security & auth status — ⚠️ DEPLOY BLOCKER

**The app currently has NO authentication.** Every route handler and server
data path uses the service-role Supabase client (`createAdminSupabase`), which
bypasses RLS. Anyone who can reach a URL can read any invoice, fetch signed file
URLs, and mutate/approve records (IDOR). This is a deliberately deferred MVP gap
(PRD §13.4 "login required", §5 RBAC = Phase 2) — **acceptable only for
local/private use. Add the auth gate before any public Vercel deploy.**

The data model is **single-tenant** (admin/reviewer/management all see all
invoices, PRD §5), so the missing control is *authentication*, not per-row
ownership — don't add `owner_id` scoping. The fix:
1. Supabase Auth (email/password or magic link) + login page.
2. `middleware.ts` that redirects unauthenticated users and refreshes the session.
3. Switch server reads to the cookie-bound `createServerSupabase()` (honors the
   existing `authenticated using (true)` RLS) and gate route handlers on a valid
   session; keep `createAdminSupabase()` only for the extraction pipeline writes.

## Commands

```bash
npm run dev          # local dev server
npm run build        # production build (run before pushing/deploying)
npm run lint         # eslint
npx supabase ...     # Supabase CLI (not installed globally; use npx)
```

Env vars live in `.env.local` (see `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only), `OPENAI_API_KEY` (server only).

## Architecture

```
src/
  app/                      # App Router pages (dashboard, upload, review, invoices, suppliers, reports)
    api/                    # route handlers (extract, export, ...)
  components/               # UI: sidebar, status badges, tables, review pane
  lib/
    supabase/               # server.ts (service role), client.ts (browser), middleware session
    extraction/             # the engine — provider-abstracted
      schema.ts             # Zod invoice schema = the extraction contract
      provider.ts           # ExtractionProvider interface
      openai-vision.ts      # primary provider
      validate.ts           # business-rule validation (PRD §7.3.2)
      confidence.ts         # field + document confidence scoring
    suppliers/matching.ts   # multi-signal supplier matching
    duplicates/detect.ts    # duplicate scoring
    export/                 # Excel/CSV builders
supabase/migrations/        # SQL schema (PRD §11 data model)
tests/sample_invoices/      # gold-standard fixtures (from the WhatsApp samples)
```

The extraction engine is **provider-abstracted from day one** — one entry point regardless of backend, mirroring the PRD's `processor.process_invoice(file, schema, provider)`. Pipeline (each stage discrete so a regression is isolatable):

```
Upload → File Validation → (Preprocessing) → Vision/LLM Structured Extraction →
Zod Schema Validation → Business Rule Validation → Confidence + Warnings →
Human Review Queue → Approved Invoice Record
```

## Extraction contract (non-negotiable — PRD §7.3.1/§7.3.2)

Correctness requirements, not style:
- Reject malformed extraction output **before** it reaches the review queue (Zod-validate).
- `null` for unknown fields — never invent values. Money = numbers, not strings. Dates → ISO `YYYY-MM-DD`.
- Keep the original detected value alongside any normalized value; store raw OCR/model text separately from structured JSON (`extraction_logs`).
- Confidence at document **and** important-field level; warnings as an array.
- Persist both `original_file_path` and `processed_file_path`; the original is never mutated.
- Deterministic checks after extraction: total exists; date/supplier/invoice-number presence flagged; VAT reconciles when subtotal+VAT present; currency defaults `ZAR`; negative totals rejected unless credit note/refund; outlier totals flagged; duplicate risk computed before approval. Failures become plain-language warnings on the review screen.

## Domain logic that's easy to get wrong

- **Supplier matching** is multi-signal, not just fuzzy string: exact → normalized → fuzzy → VAT number → phone → address → historical user-approved matches. Same supplier recurs under inconsistent names ("SPAR", "Hartenbos Spar & Tops", "Retail Spar Hartenbos") and across branches. Store `original_supplier_name` on the invoice; link to a normalized supplier silo (`parent_supplier_id` for branches).
- **Duplicate detection:** primary `Supplier + Invoice Number + Date + Total`; fallback when invoice number missing (common on till slips) `Supplier + Date + Total + image similarity`. Run before approval.
- **VAT** is often missing/unclear on thermal slips/informal receipts — absence is a flag, not an error. Don't assume a tax invoice has clean VAT.
- **Document types**: Tax Invoice / Receipt / Cash Sale / Purchase Notice / Prepaid Electricity / Statement / Unknown / Not Invoice — drives VAT and reporting behavior.

## Data model

PRD §11. Core tables: `suppliers` (+`parent_supplier_id`), `invoices`, `invoice_items`, `document_uploads`, `extraction_logs` (raw + extracted + validated JSON + provider/model + warnings), `extraction_fields` (per-field raw/normalized/confidence/correction audit), `duplicate_checks`, `audit_logs`. Approved financial records are never silently deleted; manual corrections are audit-logged.

## Testing & extraction quality

Quality is measured **field-by-field against a gold-standard set** of 30–50 hand-labeled real invoices, not unit tests alone. MVP accuracy targets *before human correction* (PRD §12.1): supplier 85%+, total 90%+, date 80%+, doc-type 80%+, VAT-where-present 75%+, obvious duplicates 90%+. **Regression rule:** any change to extraction prompt/schema/preprocessing/provider must re-run the full sample set spanning all hard cases (thermal slips, A4 tax invoices, cropped/skewed WhatsApp photos, purchase notices, missing-VAT receipts, repeat suppliers, handwriting). Don't fix one document type while regressing another.

## UI direction

"Airtable structure + Xero polish + modern AI tool clarity." Light off-white workspace `#F8FAFC`, dark navy sidebar `#0F172A`, white cards, primary action blue `#2563EB`. Fixed semantic status colors: Approved `#16A34A`, Needs Review `#F59E0B`, Low Confidence `#DC2626`, Duplicate `#EA580C`, Processing `#3B82F6`, Rejected `#6B7280`. Invoice register = Airtable-style filterable table; review screen = split-pane (original image left, editable fields right). Font: Inter. Full palette/screens in PRD §9–§10.
