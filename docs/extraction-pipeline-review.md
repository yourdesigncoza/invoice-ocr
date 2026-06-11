# Extraction pipeline review — backlog

An adversarial architecture review of the capture → OCR → model-usage flow,
captured here so it can be attended to piecemeal. Date: 2026-06-11.

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

### B4 — Credit-note exemption is dead code · MEDIUM
- [ ] `validate.ts:26-28` exempts negative totals for
      `/credit|refund/.test(document_type)`, but `DOCUMENT_TYPES`
      (`constants.ts:13-22`) has no credit-like type → branch can never match. A
      legit supplier credit note hardFails as "Negative total on a non-credit
      document."
- [ ] **Fix:** add `"Credit Note"` to `DOCUMENT_TYPES` (prompt rule 6 then offers
      it to the model and the existing regex starts working). Re-run gold set.

### B5 — "Untouched original" guarantee is hollow · MEDIUM (audit + future-proofing)
- [ ] What's stored as the original is the client-recompressed 1568px/q0.82 JPEG
      with **EXIF stripped** (`compress.ts` canvas re-encode); the camera-native
      file never leaves the phone. Consequences: re-extraction / region-crop / a
      future better model can never see >1568px; no capture-time/GPS for the
      audit trail of financial records. (`preprocess.ts:10`'s "original never
      mutated" is true only server-side.)
- [ ] Symptom: because the client already caps at 1568, the server `sharp` path
      almost never fires → `processed_file_path` is ~always null and the
      server-side EXIF-orient never runs.
- [ ] **Fix:** raise client `MAX_SIDE` to ~2400–2560 (a receipt at 2560/q0.85 is
      ~1–2 MB, well under the 4.5 MB body limit) so the *stored* original keeps
      headroom while the server's 1568 cap still governs what's sent to the model
      (makes the currently-dead server preprocess layer meaningful again).
- [ ] Optional: read EXIF `DateTimeOriginal` client-side before re-encode, post it
      as a field onto `document_uploads`.

### B6 — Opaque client failure modes · LOW
- [ ] If compression fails (HEIC, low-memory canvas) the original >4.5 MB file is
      uploaded anyway and dies at the Vercel body limit with a non-JSON response →
      `res.json()` throws → user sees `"Upload error: SyntaxError…"`. HEIC dies
      later with a raw server message.
- [ ] **Fix:** post-compress client guard — type ∈ accepted set and size < ~4 MB —
      with a human message ("This photo format isn't supported / file too large").
      HEIC also sails past the broad `image/*` camera input and drag-drop (no
      client type filter).

---

## Enhancements — optional, ranked by impact/effort

### E1 — Crop to the document, don't just downscale · HIGH impact / MEDIUM effort
- [ ] gpt-4o's high-detail pipeline scales the **shortest** side to 768px, so
      effective DPI depends on aspect ratio; receipt photos carry 30–50% dead
      background (table, hand). A cheap content-crop to the document boundary
      raises effective resolution on the print — exactly where the I/1, O/0, G/6
      confusions in `invoice_number` / `vat_number` live. Likely worth more than
      any prompt tweak. Validate on the gold set.
- [ ] Note: `preprocess.ts:8` mis-attributes 1568px to "OpenAI's high-detail tile
      size" — 1568 is Anthropic/Claude's recommended max; OpenAI fits 2048², then
      shortest-side 768, tiles at 512. Fix the comment.

### E2 — Cheap OCR as a verification layer (not a second extractor) · MED-HIGH impact / MEDIUM effort
- [ ] Run one cheap text-OCR pass (Google Vision `TEXT_DETECTION` ~$1.50/1k, or
      tesseract-wasm $0) over the stored image; store it in `raw_ocr_text` —
      which today wrongly holds the model's own JSON (mild PRD §7.3.1 contract
      violation; `index.ts` sets `rawText: content`).
- [ ] Deterministic cross-check: does the LLM's `invoice_number` / `vat_number`
      appear (modulo whitespace) in the OCR dump? Present → confidence boost;
      absent → per-field "could not be cross-verified" warning. Catches the
      single-char hallucinations measured in eval; feeds B3's ceiling. (Some
      misses stay irreducible.)

### E3 — Parallelize Phase 2 + persist token usage · MED impact / LOW effort
- [ ] Bounded-concurrency batch (overlaps with B2 fix-i) turns a 10-photo batch
      from ~3–4 min to <1 min.
- [ ] Capture `completion.usage` into `extraction_logs` → per-document cost
      telemetry before public signup (a flagged budget risk).

### E4 — Currency-gated soft VAT-number lint · LOW-MED impact / LOW effort
- [ ] Survives the multi-country objection because it's per-tenant-gated, not a
      country assumption: **only when** `default_currency === "ZAR"`, warn (never
      fail) if `vat_number` isn't 10 digits starting with `4`. Flags the
      digit-transposition class measured at ~88%. Skip if considered re-raising a
      settled decision.

### E5 — Magic-byte sniff in `storeOriginal` · LOW impact / trivial
- [ ] `file.type` is client/accident-controlled; sniff first bytes (or rely on
      `sharp(buffer).metadata()` succeeding) to turn confusing background failures
      into upfront 400s.

**Explicitly not recommended:** deskew / contrast / grayscale preprocessing (new
regression surface across the document-type matrix; gpt-4o is robust to moderate
skew; E1's crop subsumes most of the benefit). No model changes (settled).
