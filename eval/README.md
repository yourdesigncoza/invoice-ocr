# Extraction evaluation

Two non-destructive tools (no DB/storage) for choosing and trusting an
extraction model. Both use the **exact production prompt, schema, and image
preprocessing** (mirrored from `src/lib/extraction/`).

## 1. `compare_models.py` — agreement test

Runs N models over the same scans and diffs every field. Shows where they
**disagree**, plus per-model latency and confidence. Good for a fast read on
whether a new model behaves like the current one.

```bash
python3 eval/compare_models.py --models gpt-4o,gpt-5.4-mini
python3 eval/compare_models.py --limit 8        # first 8 images
```

Agreement ≠ accuracy — when two models disagree it can't tell you which is
right. For that, use the gold set.

## 2. `score_models.py` — accuracy vs ground truth

Scores each model **field by field against `labels.json`** (human-verified
truth) and reports accuracy against the PRD §12.1 targets.

```bash
python3 eval/score_models.py --models gpt-4o,gpt-5.4-mini
```

### `labels.json` — the gold standard

One entry per receipt with the **correct** value for each field, read from the
image. `verified: false` means a human hasn't signed it off yet — the scorer
warns and treats numbers as provisional until you flip it to `true`.

```jsonc
{
  "image": "WhatsApp Image ... .jpeg",
  "verified": true,                    // flip after you confirm the row
  "supplier": "STAT Warehouse (Pty) Ltd",
  "invoice_date": "2026-05-26",        // ISO, or null if absent/illegible
  "document_type": "Tax Invoice",
  "vat_amount": 11.48,                 // number, or null
  "total_incl_vat": 88.0,
  "invoice_number": "INV292093",
  "vat_number": "4030274569",          // null if none
  "notes": "..."
}
```

**Verifying / extending:** open each receipt, confirm or fix the values, set
`verified: true`. Add more receipts the same way (aim for 30–50 covering all
hard cases — thermal slips, missing VAT, handwriting, repeat suppliers). A
`null` value is a real answer (e.g. a cropped-off shop name) — the model scores
correct only if it also returns null.

**Label only what's on the image.** Ground truth must be what a careful human
can read *from the image*, NOT what you happen to know about the supplier. If a
shop name is cropped off, the honest label is `null` — labelling the real name
penalises the model for not hallucinating it (and rewards lucky guesses). For
the murky middle — a partial name + reg/VAT numbers the model can reasonably
infer from — keep the label but list the field in `inference_dependent` so its
score is read with that caveat.

### Matching rules (per field)

| Field | Match |
|---|---|
| supplier | token overlap ≥ 50% (handles "SPAR Hartenbos" vs "Hartenbos Spar & Tops"); null ↔ empty |
| invoice_date | exact ISO |
| document_type | exact (case-insensitive) |
| total / vat | numeric, 2 dp |
| invoice_number | alphanumeric, case-insensitive |
| vat_number | digits only |

## Regression discipline (PRD §12.2)

Re-run `score_models.py` after any change to the prompt, schema, preprocessing,
or model. Don't let a change improve one document type while regressing another.

## Privacy

`labels.json` and `results.json` contain data from real client receipts and are
git-ignored. `labels.example.json` shows the format. If your repo is private and
you want the gold set versioned, remove `eval/labels.json` from `.gitignore`.
