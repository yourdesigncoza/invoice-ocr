# SpendSilo — Invoice Capture & Supplier Spend Intelligence

> Snap a photo of an invoice. Review the extracted data. Get clean supplier
> spend reports by week, month, quarter, and year.

**SpendSilo** turns messy invoice photos, till slips, and supplier documents
into clean, reviewed, searchable spend data. Multi-tenant SaaS built on
**Next.js 16 + Supabase**, deployed on **Vercel**, installable as a **PWA** on
your phone's home screen.

It is not just OCR — the value is the intelligence layer: human-assisted
extraction, supplier silos, duplicate detection, VAT validation, cost-centre
sites with per-line splitting, and time-based spend reporting. See
[`invoice_ocr_app_prd_v2.md`](./invoice_ocr_app_prd_v2.md) for the product
spec, [`CLAUDE.md`](./CLAUDE.md) for architecture, and
[`docs/brand-guidelines.md`](./docs/brand-guidelines.md) for the brand.

## How it works

```
Upload (photo/PDF, batches) → store original (untouched) → OpenAI Vision
structured extraction (background) → Zod schema validation → business-rule
validation → confidence + warnings → Review Queue → human reviews split-pane
(image | editable fields) → link supplier silo · assign/split sites · mark Paid
→ Approve → Invoice Register → Dashboard / Reports / CSV Export
```

Nothing is auto-approved. Only human-approved records feed dashboards and
reports (PRD §3).

## Feature highlights

- **Human-assisted extraction** — supplier, dates, totals, VAT, line items,
  document type (Tax Invoice / Receipt / Credit Note / …), with per-document
  confidence scoring and plain-language warnings. SA-market defaults (ZAR,
  15% VAT), currency configurable per user.
- **Supplier silos** — the same shop under inconsistent names ("SPAR",
  "Hartenbos Spar & Tops") is matched into one supplier via multi-signal
  matching (name, VAT number, phone, address, history).
- **Duplicate detection** — computed automatically at upload; flagged invoices
  get an orange badge and the reviewer accepts or deletes.
- **Sites (cost centres)** — adaptive: the site picker/filter/column only
  appear once a user has ≥2 active sites. One receipt covering two sites can be
  **split by line item**: tag the exception lines and the total is divided
  proportionally; a manual amount split covers documents with no readable
  lines. Per-site reports, register filter, and CSV export all reconcile to
  invoice totals by construction.
- **Reports & exports** — spend by supplier/site over day/week/month/quarter/
  year; register CSV (one row per site allocation) and a monthly VAT-summary
  CSV for filing.
- **Multi-tenant & private** — every user owns their data (Postgres RLS,
  per-user storage paths); a super-admin manages accounts only, never tenant
  data. Approved records are never silently deleted; corrections are
  audit-logged.
- **PWA** — install to the phone home screen and snap invoices on the go; a
  first-run **Getting Started** guide walks new users through the flow.

## Tech stack

| Layer | Choice |
|---|---|
| App / UI | Next.js 16 (App Router), React 19, TypeScript, Tailwind v4 |
| Auth | Supabase Auth (email + password, confirmation on), RLS everywhere |
| Database | Supabase Postgres (`supabase/migrations/`, 0001 → 0011) |
| File storage | Supabase Storage (`invoices` bucket, per-user paths) |
| Extraction | OpenAI Vision (`gpt-4o`), provider-abstracted (`src/lib/extraction/`) |
| Deploy | Vercel |

## Local setup

1. **Install**
   ```bash
   npm install
   ```
2. **Env** — copy `.env.example` → `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server only)
   - `OPENAI_API_KEY` (+ optional `OPENAI_VISION_MODEL`, default `gpt-4o`)
   - `ADMIN_EMAILS` — comma-separated super-admin account(s) for `/admin`
3. **Database** — apply the migrations in `supabase/migrations/` **in order**
   (0001 → 0011) against your Supabase project:
   ```bash
   npx supabase db push          # if using the Supabase CLI + linked project
   # — or paste each file into the SQL editor, in numeric order
   ```
   0001 also creates the private `invoices` storage bucket.
4. **Run**
   ```bash
   npm run dev      # http://localhost:3000 — sign up, confirm email, go
   ```

## Scripts

```bash
npm run dev      # dev server
npm run build    # production build (run before deploying)
npm run lint     # eslint
npm test         # vitest unit tests; single file: npx vitest run path/to.test.ts
```

Extraction quality is measured against a hand-verified gold set — see
[`eval/README.md`](./eval/README.md) (`compare_models.py`, `score_models.py`,
and the human verification portal in `eval/portal/`). Any change to the
extraction prompt/schema/preprocessing must re-run the gold set.

## Deploy to Vercel

```bash
vercel link          # link/create the project
vercel env add ...   # add the env vars above (or via the dashboard)
vercel --prod
```

Set all env vars in the Vercel project for **Production** and **Preview**.
Before opening signup to the public: add an upload rate-limit (open signup
spends the OpenAI budget) and enable Supabase leaked-password protection.

## Project layout

```
src/app/(app)/...      dashboard, upload, review, invoices, suppliers, duplicates,
                       reports, exports, getting-started, settings, admin
src/app/(auth)/...     login, signup, forgot/reset password
src/app/api/...        extract · invoices/[id] · export · projects · settings · admin/users
src/lib/extraction/    provider-abstracted engine + Zod contract + validators + confidence
src/lib/suppliers/     multi-signal supplier matching
src/lib/duplicates/    duplicate scoring
src/lib/allocations/   multi-site split math + allocation sync
supabase/migrations/   schema, RLS, and backfills (PRD §11 data model)
eval/                  extraction accuracy harness + human verification portal
tests/                 vitest unit tests + sample invoice fixtures (PRD §12)
public/                PWA: service worker, offline shell, icons
```
