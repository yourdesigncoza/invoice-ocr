# Extraction pipeline review — backlog

An adversarial architecture review of the capture → OCR → model-usage flow,
captured here so it can be attended to piecemeal. Date: 2026-06-11.

**Status (2026-06-11): backlog worked through.** All six bugs (B1–B6) shipped and
the three low-/medium-effort enhancements (E3, E4, E5) shipped. **E1** (crop-to-
document) and **E2** (OCR cross-check) are **deferred with rationale** (below) —
both need infra/validation work (real document detection + gold-set harness
parity; an OCR engine + deploy-measured noise tuning) that shouldn't be landed
blind against the project's own regression rule. The only other open item is the
long-term durable-queue under B2. Gold set after the shipped changes: 92%, all
PRD §12.1 targets met, no regression.

**Scope reviewed:** `UploadClient.tsx` → `compress.ts` → `api/extract/route.ts`
(Phase 1 store + Phase 2 `after()`) → `preprocess.ts` → `openai-vision.ts` →
`schema.ts` → `validate.ts` → `confidence.ts` → `index.ts`.

**Overall verdict:** the shape is sound — clean provider abstraction, strict Zod
schema gate, honest human-in-the-loop, correct per-user tenant scoping. Three
issues undercut it: one guaranteed-failure feature (PDF), one statistically
inevitable stranding bug (sequential batch vs. the 300 s ceiling, no reaper),
and a trust signal (status) that is a pass-through of model self-confidence and
ignores the pipeline's own arithmetic evidence. Fix B1–B3 and the architecture
is genuinely solid.

**Settled decisions (do NOT re-open):** gpt-4o is the chosen model (beat
gpt-5.4/5.4-mini/5.5 on a 34-row human-verified gold set; the gpt-5.x reasoning
models hallucinate values where `null` is correct). No SA-specific VAT-number
*checksum* validator (app may run in other countries). See
[extraction-strategy-analysis.md](./extraction-strategy-analysis.md).

**Regression rule:** any change to prompt / schema / preprocessing / provider
must re-run `eval/score_models.py` against the full gold set before it ships.

---

## Bugs — correctness / reliability

### B1 — PDF path is broken end-to-end · HIGH · ✅ DONE 2026-06-11
- [x] PDFs are advertised + accepted (`UploadClient.tsx:94,181`, `route.ts:12`
      `ACCEPTED`) but `preprocess.ts:29-31` passes them through and
      `openai-vision.ts:41-45` unconditionally throws. Result: stored → queued →
      background fail → confusing "failed" toast, real reason buried in
      `extraction_logs.errors`.
- [ ] ~~Quick fix: remove `application/pdf`~~ — superseded by the real fix.
- [x] **Real fix (shipped + verified):** `openai-vision.ts` branches on mime and
      sends PDFs natively to gpt-4o as a base64 `file` content part (image path
      unchanged). Confirmed end-to-end against
      `tests/sample_invoices/wordpress-pdf-invoice-plugin-sample.pdf` — extracted
      supplier / invoice no / dates / line totals correctly in ~11s. Opt-in smoke
      test: `RUN_PDF_SMOKE=1 npx vitest run tests/integration/pdf-extract.smoke.test.ts`
      (gated so it never runs in normal `npm test` / CI).

### B2 — Stranded `processing` rows: no reaper · HIGH · ✅ DONE 2026-06-11
- [x] `after()` is bounded by `maxDuration = 300` (`route.ts:10`); the batch loop
      is **sequential** (`route.ts:77-81`); gpt-4o high-detail is ~15–30 s/image.
      A 12–20 photo batch exceeds 300 s → instance killed mid-loop → remaining
      `document_uploads` rows stay `'processing'` forever (no reaper / no
      claimed-at / no timeout). The status poll then resurfaces ghost
      "Processing…" toasts on every load. Same outcome on any OOM/crash.
- [x] **Fix (i) shipped:** Phase 2 loop now runs `PHASE2_CONCURRENCY = 4` via
      `Promise.allSettled` waves (`route.ts`).
- [x] **Fix (ii) shipped:** the no-`ids` re-discovery branch of
      `uploads/status/route.ts` reaps `processing` rows older than 10 min to
      `failed` (RLS-scoped to the caller) before reading.
- [ ] **Long term:** durable queue (Supabase pgmq / QStash) with per-job claim +
      job-level retry (also fixes the missing job-level retry once the OpenAI
      SDK's built-in `maxRetries: 2` is exhausted).

### B3 — Status trusts model self-report, ignores deterministic evidence · MEDIUM · ✅ DONE 2026-06-11
- [x] `confidence_score` is a required schema key (`schema.ts:87,109,170`,
      type `["number","null"]`), so gpt-4o nearly always returns a number → the
      weighted fallback rarely runs. Status was ~pure model self-assessment.
- [x] **Fix shipped:** `scoreDocument` now returns `min(model_score,
      derived_score)` and applies a deterministic ceiling — caps below
      `CONFIDENCE.medium` (→ `low_confidence`) when `reconcileFailed` (now
      surfaced from `validate.ts`) **or** supplier+date are both missing.
      `index.ts` threads the flag through. Self-report can lower but never raise
      the score. Covered by updated `confidence.test.ts` / `validate.test.ts`
      (42/42 pass).
- Note: B3 changes confidence/status scoring only, **not** extracted field
  values, so the `eval/score_models.py` gold set (which scores field accuracy)
  is unaffected. B1 left the image content-part byte-identical, so it's
  unaffected too.

### B4 — Credit-note exemption is dead code · MEDIUM · ✅ DONE 2026-06-11
- [x] `validate.ts` exempted negative totals for `/credit|refund/` on
      document_type, but `DOCUMENT_TYPES` had no credit-like value → never matched.
- [x] **Fix shipped:** added `"Credit Note"` to `DOCUMENT_TYPES` (constants +
      migration 0009 `alter type document_type add value`). Prompt now offers it
      and the regex works. Gold set re-run: document_type held at 34/34 (100%),
      overall 92% (within noise) — no regression.

### B5 — "Untouched original" guarantee is hollow · MEDIUM · ✅ DONE 2026-06-11
- [x] Stored "original" was the client-recompressed 1568px/q0.82 JPEG with EXIF
      stripped; resolution capped forever, server `sharp` path almost never fired.
- [x] **Fix shipped:** raised client `MAX_SIDE` to 2560 (q0.85) so the stored
      original keeps headroom; the server's 1568 cap now actually governs the
      model input. `preprocess.ts` comment corrected (1568 attribution).
- [ ] Not done (optional): post EXIF `DateTimeOriginal` onto `document_uploads`
      for the audit trail. (Canvas re-encode still strips EXIF; capture-time
      metadata would need reading before re-encode.)

### B6 — Opaque client failure modes · LOW · ✅ DONE 2026-06-11
- [x] HEIC / oversized files died with an opaque `SyntaxError` at the body limit.
- [x] **Fix shipped:** post-compress guard in `UploadClient` checks type ∈
      accepted set and size < 4 MB, surfaces a human message, and uploads only
      the sendable files (staying on the page so rejects remain visible).

---

## Enhancements — optional, ranked by impact/effort

### E1 — Crop to the document, don't just downscale · HIGH impact / MEDIUM effort · ⏸ DEFERRED 2026-06-11
The valuable version raises effective DPI on the print (where the I/1, O/0, G/6
confusions live) by cropping the 30–50% dead background out of receipt photos.
**Deferred — cannot be shipped safely in this autonomous pass**, because:
1. **It needs real document detection, not a trim.** `sharp.trim()` keys off the
   top-left pixel and is a near-no-op on the textured (table/hand) backgrounds of
   the phone photos that actually need it; it only helps clean scans. A genuine
   content-crop needs edge/contour detection (OpenCV-class), which is a real
   feature with its own regression risk (cropping *into* the receipt).
2. **The regression rule can't be honored without harness parity.** The gold set
   (`eval/compare_models.py`) mirrors the TS preprocessing in its own Python
   `preprocess_b64`; a crop added only to `preprocess.ts` would never be exercised
   by the scorer, so "validate on the gold set" would be meaningless until the
   same crop is ported there. That porting is itself substantial.
   → Do as a focused, separately-tested change with harness parity first.
- [x] Trivial sub-item done: corrected the `preprocess.ts` 1568px mis-attribution
      comment (it's Anthropic's recommended max, not an OpenAI tile size).

### E2 — Cheap OCR as a verification layer · MED-HIGH impact / MEDIUM effort · ⏸ DEFERRED 2026-06-11
Cross-check the LLM's `invoice_number`/`vat_number` against a cheap text-OCR pass
(present → boost; absent → "couldn't cross-verify" warning), and populate
`raw_ocr_text` with real OCR text (today it holds the model's JSON — a mild PRD
§7.3.1 contract violation). **Deferred — needs infra that can't be validated in
this pass:**
- An OCR engine: tesseract-wasm (~MB bundle + seconds/image in the background
  function, unverifiable without a Vercel deploy) or a paid cloud OCR (creds +
  cost). Either is a real integration decision.
- Tuning to avoid false "couldn't cross-verify" noise on poor thermal-slip OCR,
  which would erode trust in the warning list. Needs the gold set + real slips.
  → Best as a dedicated change with a deploy to measure latency + warning noise.

### E3 — Parallelize Phase 2 + persist token usage · MED impact / LOW effort · ✅ DONE 2026-06-11
- [x] Parallelized as part of B2 (`PHASE2_CONCURRENCY = 4`).
- [x] `completion.usage` captured and stored on `extraction_logs`
      (prompt/completion/total tokens; migration 0010). Threaded via
      `ProviderResult.usage` → `ProcessedInvoice.usage`.

### E4 — Currency-gated soft VAT-number lint · LOW-MED impact / LOW effort · ✅ DONE 2026-06-11
- [x] Shipped: `validateExtraction(ex, { defaultCurrency })` warns (never fails)
      when `default_currency === "ZAR"` and `vat_number` isn't 10 digits starting
      with 4. Currency resolved before extraction in `route.ts`; unit-tested.

### E5 — Magic-byte sniff in `storeOriginal` · LOW impact / trivial · ✅ DONE 2026-06-11
- [x] Shipped: `sniffMime(buffer)` (JPEG/PNG/PDF/WEBP signatures) replaces trust
      in `file.type`; unrecognised files reject upfront, detected type used
      downstream.

**Explicitly not recommended:** deskew / contrast / grayscale preprocessing (new
regression surface across the document-type matrix; gpt-4o is robust to moderate
skew; E1's crop subsumes most of the benefit). No model changes (settled).
