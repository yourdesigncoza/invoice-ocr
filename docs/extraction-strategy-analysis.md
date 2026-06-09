# Extraction Strategy Analysis — LlamaIndex vs our custom engine

> Saved 2026-06-09. Decision-support analysis triggered by the LlamaIndex
> article ["Best AI for Receipt Processing"](https://www.llamaindex.ai/insights/best-ai-for-receipt-processing).
> Question asked: *is LlamaParse/LlamaExtract a genuine improvement over our
> custom OpenAI-Vision extraction, judged purely on "best system" (not migration
> cost / legacy)?*

## Verdict

LlamaIndex is a genuine improvement on a **few specific extraction
capabilities** we're weak or missing on — but it is **not a "better system,"**
because it only replaces the *front door* (raw extraction). SpendSilo's actual
value — supplier silos, duplicate detection, SA-VAT validation, sites, the
review UX — is something LlamaIndex does not touch. The real decision is
"swap our extraction core / keep it / borrow the best ideas." **Recommendation:
borrow the best ideas; do not rip-and-replace.**

## What's actually being compared

The article is **LlamaIndex's own marketing blog** and ranks its own product #1
— a vendor listicle, not an independent benchmark. It blurs two products:

- **LlamaParse** — document → clean text/markdown/JSON. Strong on complex PDFs,
  nested tables, skewed scans. A *parsing* layer.
- **LlamaExtract** — schema-driven structured extraction with field-level
  confidence. *This* is the real apples-to-apples comparison to our engine.

Crucially, LlamaParse/LlamaExtract run **on the same frontier vision models we
already call** (the article notes it "added support for GPT-4.1 and Gemini 2.5
Pro"). It is an **orchestration/wrapper layer over the same models**, not a
different brain.

## We already built the article's "ideal pipeline"

The article's own "strong production workflow" checklist maps almost 1:1 onto
what we already have:

| Article says you need | Our implementation |
|---|---|
| Field-level confidence scoring | `confidence.ts` + per-field `confidence` in schema |
| Business-rule validation (subtotal+tax=total, currency, date) | `validate.ts` (VAT reconcile, outliers, negatives) |
| Human-in-the-loop review | review queue + split-pane |
| Document classification & routing | doc-type enum |
| Schema normalization (merchants, currency, dates) | multi-signal supplier matching + currency stamping |
| Auditability (source image, values, confidence, revisions) | `extraction_logs`, `extraction_fields`, `audit_logs` |

## Pros — where LlamaIndex genuinely beats us today

1. **Multi-page PDF parsing out of the box.** Our biggest *actual gap* — the
   provider throws on PDFs today (`openai-vision.ts`: "convert to page images
   first"). Real hole for an invoice product.
2. **Automatic skew / orientation correction.** We downscale (`preprocess.ts`)
   but don't de-skew. Crooked phone photos are in our hard-case set.
3. **Agentic auto-correction loops.** Internal re-validate/re-prompt to cut
   hallucinations. We do a single temp-0 pass + Zod boundary.
4. **Better line-item / nested-table extraction.** Exactly where direct GPT-4o
   vision is weakest. Our prompt (rule 9) even tells the model to give up on
   thermal line items rather than guess.
5. **Per-field citations + cost-routing** (cheap model for simple receipts,
   premium for hard ones). We'd have to build both.

## Cons — product-level, not migration/legacy

True even starting from a blank repo:

1. **Data leaves our stack to a third-party US processor.** SpendSilo is a
   multi-tenant SA SaaS holding *other businesses'* financial documents. Today
   the only outside party is the model provider (OpenAI). LlamaCloud adds a
   *second* US cloud in the data path — a POPIA/trust liability for a product we
   want to market in SA. Defensible only on their enterprise no-data-retention
   tier (must pay for + verify).
2. **Doesn't improve the moat.** LlamaExtract swaps only the extraction
   front-door. Supplier silos, duplicate detection, VAT logic, reporting get
   zero benefit — ~15% of the product surface improved for a new dependency.
3. **Cost stacks on top of the model.** LlamaCloud is credit-based (~$1–1.25 per
   1,000 credits). Structured extraction ≈ 5 credits/page (fast) up to 45–60
   credits/page (agentic/premium) → ~$0.005 to ~$0.06 per page, on top of /
   in place of a direct model call, paying their margin per page forever.
4. **Less deterministic control over SA-specific behaviour.** Our Zod contract +
   SA-VAT noise filter + flat-15% logic are tuned for our market. A managed
   extractor is more of a black box for that tuning.

## Independent accuracy reality (not the vendor blog)

- LlamaExtract ≈ **94%**; GPT-4o direct image ≈ **90.5%** (weak on line items).
- **Gemini 2.5 Pro ≈ 94% on scanned invoices on its own.**

Most of LlamaExtract's edge = (a) a stronger underlying model + (b) better table
handling — **both obtainable directly**, since we're already provider-abstracted
(`OPENAI_BASE_URL` can point at Gemini/OpenRouter today, no architecture change).

## Recommended path ("best system"), by ROI

1. **Benchmark a stronger model in the existing `eval/` harness first.** Wire
   Gemini 2.5 Pro (or GPT-4.1) through the provider abstraction, measure against
   the gold set. Highest-impact, lowest-risk, *measurable* accuracy lever; no
   third-party data exposure.
2. **Fix the PDF gap.** Add a PDF→page-image step into our pipeline, OR use
   **LlamaParse purely as a PDF *parsing* step** for hard multi-page docs while
   keeping our own extraction + domain engine. (The one place LlamaParse earns
   its keep without handing over the structured-extraction core or simple-receipt
   volume.)
3. **Add de-skew + line-item improvements** to `preprocess.ts`/prompt — cheap
   wins targeting our two measurably-weakest areas.
4. **Only then**, if eval says LlamaExtract still beats a tuned Gemini setup on
   *our* gold set by a margin worth the privacy/cost trade — revisit adopting it.

Marketing takeaway: "best system" is won by **model choice + closing the
PDF/line-item gaps + keeping data in our own controlled path**, not by adding a
vendor layer that improves a slice while weakening the data-privacy story. Being
able to A/B against a real gold set is itself a marketing claim most receipt
tools can't make.

## Sources

- [LlamaIndex: Best AI for Receipt Processing](https://www.llamaindex.ai/insights/best-ai-for-receipt-processing)
- [LlamaParse / LlamaCloud pricing](https://www.llamaindex.ai/pricing) · [ZenML: LlamaIndex pricing breakdown](https://www.zenml.io/blog/llamaindex-pricing)
- [Businessware: Textract vs Google/Azure/GPT-4o invoice benchmark](https://www.businesswaretech.com/blog/research-best-ai-services-for-automatic-invoice-processing)
- [arXiv: Multi-Modal Vision vs Text-Based Parsing for Invoices](https://arxiv.org/html/2509.04469v1) · [arXiv: Invoice Information Extraction evaluation](https://arxiv.org/pdf/2510.15727)
- [Koncile: Claude vs GPT vs Gemini for invoice extraction](https://www.koncile.ai/en/ressources/claude-gpt-or-gemini-which-is-the-best-llm-for-invoice-extraction)

## Follow-up ideas under discussion (2026-06-09)

John's proposals + my engineering take. Decisions deferred until the gold-set
benchmark gives real numbers.

### Idea 1 — Tiered escalation (cheap model → strong model when "hard")
- **Endorsed.** Classic model-cascade: cheap fast model on the easy majority,
  premium model only for the hard minority. Keeps cost low while raising ceiling.
- **Critical caveat:** do NOT gate on the model's *self-reported* confidence —
  LLMs are badly calibrated and are often *confidently wrong* (a faded "8" read
  as "3" at 0.95). Gate primarily on the **deterministic signals we already
  compute** in `validate.ts`: VAT fails to reconcile, total/date/supplier
  missing, `hardFail`, key fields null — *then* factor confidence.

### Idea 2 — Adversarial dual-LLM (two models, reconcile, return final)
- **Endorsed as the *escalation tier*, not for every doc** (2× cost on all docs
  otherwise).
- **Key insight:** agreement between two *independent* models is a far better
  confidence signal than any single model's self-grade. Use **two different
  providers** (e.g. OpenAI + Gemini) so failure modes are independent — two of
  the same model make the same mistake on the same smudge.
- **Reconciliation = field-level:** fields where both agree → high trust;
  disagreements → flag that field and show **both candidate values side-by-side**
  in the review pane. Fits the "never auto-approve" rule perfectly.

### Synthesis — the recommended design
Confidence-gated cascade where the escalation tier is the dual-model cross-check:
1. **Tier 1:** cheap fast model (gpt-4o-mini / Gemini Flash) on every doc.
2. **Gate:** deterministic validation + low confidence + missing fields → "hard".
3. **Tier 2 (hard only):** two strong models (Gemini 2.5 Pro + GPT-5.x);
   field-level agreement auto-fills agreed fields and flags disagreements with
   both values shown.

Result: cheap for the easy majority, max accuracy + a *trustworthy* confidence
signal for the hard minority, and a better reviewer UX (side-by-side candidates)
as a free byproduct.

### Idea 3 — De-skew preprocessing
- **Add it, but measure before assuming a win.** Classical OCR needs de-skew;
  modern *vision* models tolerate moderate skew/rotation well, and we already
  EXIF-auto-orient in `preprocess.ts`. Test against the gold set rather than
  assume impact.

### Metering / pricing
- Cost is not seen as a blocker; a small per-use fee could offset premium-tier
  spend. **Tie-in:** the per-user **extraction-count** stat shipped to the admin
  page (migration `0008_admin_user_stats`) is exactly the usage meter to bill
  against — the architecture already supports per-user metering.

## Actionable backlog (nuggets → concrete work)

Status legend: ⬜ not started · 🔬 needs gold-set measurement first.

1. ⬜🔬 **Bidirectional image normalization** — `preprocess.ts` only *downscales*
   (caps long side at 1568); it does nothing for images *smaller* than optimal.
   Add **upscaling of small receipts toward ~1568** (LANCZOS). Evidence: the
   CodeCut tutorial's only failure was a *small* receipt, fixed by a 3× upscale.
   Cheap, directly targets our hard cases (tiny thermal slips, cropped photos).
2. ⬜🔬 **Model A/B benchmark** — already wired: `eval/score_models.py` defaults
   to `--models gpt-4o,gpt-5.4-mini` and reuses the production prompt/schema.
   Run it; add **Gemini 2.5 Pro** (via the existing `OPENAI_BASE_URL` provider
   abstraction). Highest-ROI accuracy lever; also yields the confidence-vs-
   accuracy curve to set the escalation threshold (don't guess "90").
3. ⬜ **Fix the PDF gap** — provider throws on PDFs today. Either add a
   PDF→page-image step into our pipeline, OR use **LlamaParse purely as a PDF
   *parsing* step** for hard multi-page docs while keeping our own extraction +
   domain engine. (The one place LlamaParse clearly earns its keep.)
4. ⬜🔬 **De-skew** — see Idea 3; measure first.
5. ⬜ **Tiered cascade + dual-model escalation** — build only after (2) gives the
   threshold and confirms the model lineup. See Synthesis above.
6. ⬜ **Per-use metering / fee** — optional; meter already exists (see above).

## Benchmark results — gold set, 2026-06-09

Ran `eval/score_models.py` against the human-verified gold set
(**6 receipts** — small; treat as directional, not definitive). Production
prompt/schema/preprocessing. Models that reject `temperature:0` (reasoning-class
gpt-5.x) are retried without it (harness fix below).

| Field | gpt-4o | gpt-5.4-mini | gpt-5.5 | target |
|---|---|---|---|---|
| supplier | 100% | 100% | 100% | 85% |
| invoice_date | 83% | 83% | 83% | 80% |
| document_type | 100% | 100% | 100% | 80% |
| total_incl_vat | 100% | 100% | 83% | 90% |
| vat_amount | 100% | 83%* | 83% | 75% |
| invoice_number | 100% | 100% | 83% | — |
| vat_number | 83% | 83% | 83% | — |
| **overall** | **95% (40/42)** | **93–95%** | **88% (37/42)** | — |

\* gpt-5.4-mini's vat_amount shifted 6/6→5/6 between two runs at temp 0 — ordinary
vision non-determinism, i.e. ±1–2 fields is **noise** at this sample size.

### Findings (honest read)

1. **No newer/bigger model beat gpt-4o.** gpt-4o is top/tied-top; gpt-5.4-mini
   matches it; gpt-5.5 (reasoning, forced temp 1) was *worse* and
   non-deterministic. All within noise on 6 images.
2. **The remaining errors are image-legibility limits, not model-capability
   gaps — and they're SHARED across all models:** (a) one VAT number digit
   (`4260256616` vs `4260266616` — a 5/6 ambiguity on a faded slip), (b) one
   date month misread. A stronger LLM cannot disambiguate a genuinely faded
   pixel. → **Accuracy ROI is in preprocessing (upscale/deskew) + human review,
   NOT a bigger model and NOT LlamaParse.** This is the key strategic result.
3. **gpt-5.4-mini ≈ gpt-4o** → only worth swapping if materially cheaper; the
   accuracy gain is ~nil, and GPT-5.x adds non-determinism (bad for a financial
   product that values reproducibility).
4. **Biggest gap is the gold set itself:** 6 images, none of the hardest cases
   (thermal, handwriting). **Expanding to 30–50 (PRD §12.1) is the single
   highest-value next step** before any model/architecture decision — current %
   are provisional.

### Harness fix shipped (`eval/compare_models.py`)
`extract()` previously hardcoded `temperature:0`, which made every reasoning-class
model (gpt-5.x) 400 and score a **false 0%**. Now it retries without temperature
on that specific 400, so those models evaluate on equal footing. Determinism is
still preserved (temp 0) for models that support it.

### Re-prioritised backlog after benchmark
- **Promote item 1 (bidirectional upscaling) + item 4 (de-skew) to the top** —
  the benchmark says legibility, not model choice, is the ceiling.
- **Demote item 5 (tiered cascade / dual-model)** — a stronger escalation tier
  buys little when the misses are unreadable pixels; revisit only after the gold
  set expands and shows model-fixable errors.
- **Item 2 (model A/B): mostly answered — keep gpt-4o.** Re-run only after the
  gold set grows, or to price-check gpt-5.4-mini as a cheaper equal.
- Gemini 2.5 Pro still untested here (harness is OpenAI-only); worth a separate
  base-URL run, but the legibility finding lowers its expected upside.

## Source notes — CodeCut tutorial (2026-06-09)

Article: ["LlamaIndex Receipt Data Extraction" (codecut.ai)](https://codecut.ai/llamaindex-receipt-data-extraction).
A beginner Python/Colab tutorial on the public **SROIE** receipt dataset — not a
benchmark or production design. What it yielded:

- **Useful:** the upscaling fix (→ backlog item 1).
- **Validates us:** its pipeline is `LlamaParse(image→text) → LLM(text→struct)`,
  i.e. **text-based** extraction — the LLM never sees the image. Its company-name
  failure (merging the cashier name into the merchant) is the classic symptom of
  losing visual layout. We do **direct vision** (image→struct), which keeps that
  signal. Reconfirms vision-first; reconfirms PDFs as the only clear LlamaParse
  use-case.
- **Already have it, better:** their rapidfuzz `token_set_ratio ≥ 80` ground-truth
  check ≈ our `eval/score_models.py` (field-specific: round-2 money,
  digits-only VAT, token-overlap ≥ 0.5 supplier, null-as-valid-answer). Pydantic
  ≈ our Zod schema; their `>$500`/future-date rules ≈ our `validate.ts` (more
  advanced); CSV export ≈ our `export/`.
- **Maybe:** **SROIE** as extra *volume* for model-robustness A/B — but it's
  Malaysian retail receipts (no SA VAT / doc-types), so don't let it dilute the
  SA gold set.
