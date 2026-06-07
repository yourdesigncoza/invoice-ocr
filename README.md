# Invoice OCR & Supplier Spend Intelligence

> Upload messy invoices. Review the extracted data. Get clean supplier spend reports by week, month, quarter, and year.

A modern invoice capture and supplier spend intelligence tool that converts messy
invoice photos, receipts, and supplier documents into clean, reviewed, searchable
financial data. Built on **Next.js 16 + Supabase**, deployed on **Vercel**.

It is not just OCR — the value is the intelligence layer: human-assisted
extraction, supplier silos, duplicate detection, VAT validation, and time-based
spend reporting. See [`invoice_ocr_app_prd_v2.md`](./invoice_ocr_app_prd_v2.md)
for the full product spec and [`CLAUDE.md`](./CLAUDE.md) for architecture.

## How it works

```
Upload → store original (untouched) → OpenAI Vision structured extraction →
Zod schema validation → business-rule validation → confidence + warnings →
Review Queue → human reviews split-pane (image | editable fields) →
link supplier silo → Approve → Invoice Register → Dashboard / Reports / Export
```

Nothing is auto-approved. Only human-approved records feed dashboards (PRD §3).

## Tech stack

| Layer | Choice |
|---|---|
| App / UI | Next.js 16 (App Router), React 19, TypeScript, Tailwind v4 |
| Database | Supabase Postgres (`supabase/migrations/`) |
| File storage | Supabase Storage (`invoices` bucket) |
| Extraction | OpenAI Vision, provider-abstracted (`src/lib/extraction/`) |
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
3. **Database** — run the migration against your Supabase project:
   ```bash
   npx supabase db push          # if using the Supabase CLI + linked project
   # — or paste supabase/migrations/0001_init.sql into the SQL editor
   ```
   This also creates the private `invoices` storage bucket.
4. **Run**
   ```bash
   npm run dev      # http://localhost:3000
   ```

## Scripts

```bash
npm run dev      # dev server
npm run build    # production build (run before deploying)
npm run lint     # eslint
```

## Deploy to Vercel

```bash
vercel link          # link/create the project
vercel env add ...   # add the four env vars (or via the dashboard)
vercel --prod
```

Set all env vars in the Vercel project for **Production** and **Preview**.

## Project layout

```
src/app/(app)/...      dashboard, upload, review, invoices, suppliers, duplicates, reports, exports
src/app/api/...        extract · invoices/[id] · export
src/lib/extraction/    provider-abstracted engine + Zod contract + validators + confidence
src/lib/suppliers/     multi-signal supplier matching
src/lib/duplicates/    duplicate scoring
supabase/migrations/   schema (PRD §11 data model)
tests/sample_invoices/ gold-standard fixtures for the regression set (PRD §12)
```
