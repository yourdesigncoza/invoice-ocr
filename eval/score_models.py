#!/usr/bin/env python3
"""
Score extraction models against the human-verified gold set (eval/labels.json).

Turns "the models agree 91%" into real per-model accuracy — supplier, date,
total, VAT, doc-type, invoice no, VAT no — measured against ground truth, with
the PRD §12.1 targets. Reuses the production prompt/schema/preprocessing via
compare_models.py. Non-destructive (no DB).

  python3 eval/score_models.py
  python3 eval/score_models.py --models gpt-4o,gpt-5.4-mini
"""
import argparse, json, os, re, sys
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from compare_models import load_key, extract, flatten  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGES_DIR = os.path.join(ROOT, "demo-receipts")

# label field -> flattened model field (compare_models.flatten keys)
FIELD_MAP = {
    "supplier": "supplier",
    "invoice_date": "date",
    "document_type": "doc_type",
    "total_incl_vat": "total",
    "vat_amount": "vat",
    "invoice_number": "invoice_no",
    "vat_number": "vat_number",
}

# PRD §12.1 accuracy targets (before human correction)
TARGETS = {
    "supplier": 0.85,
    "total_incl_vat": 0.90,
    "invoice_date": 0.80,
    "document_type": 0.80,
    "vat_amount": 0.75,
}


def norm(s):
    return re.sub(r"[^a-z0-9]+", " ", str(s).lower()).strip() if s not in (None, "") else ""


def digits(s):
    return re.sub(r"\D", "", str(s)) if s not in (None, "") else ""


def match(field, label, model):
    """Field-appropriate correctness test."""
    if field in ("total_incl_vat", "vat_amount"):
        if label is None:
            return model is None
        if model is None:
            return False
        return round(float(label), 2) == round(float(model), 2)
    if field == "vat_number":
        return digits(label) == digits(model)
    if field == "invoice_number":
        return norm(label).replace(" ", "") == norm(model).replace(" ", "")
    if field in ("invoice_date", "document_type"):
        return norm(label) == norm(model)
    if field == "supplier":
        # null label -> correct if model also empty (e.g. name cropped off slip)
        if label in (None, ""):
            return model in (None, "")
        if model in (None, ""):
            return False
        a, b = norm(label), norm(model)
        if a == b:
            return True
        ta, tb = set(a.split()), set(b.split())
        if not ta or not tb:
            return False
        return len(ta & tb) / min(len(ta), len(tb)) >= 0.5  # token overlap
    return label == model


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", default="gpt-4o,gpt-5.4-mini")
    ap.add_argument("--workers", type=int, default=6)
    args = ap.parse_args()

    spec = json.load(open(os.path.join(ROOT, "eval", "labels.json")))
    labels = spec["labels"]
    fields = spec["fields_scored"]
    models = [m.strip() for m in args.models.split(",")]
    key = load_key()

    unverified = [l["image"] for l in labels if not l.get("verified")]
    if unverified:
        print(f"⚠  {len(unverified)}/{len(labels)} labels are NOT human-verified yet — "
              f"treat the numbers as provisional until you flip `verified: true`.\n")

    # run every (label, model) extraction
    jobs = [(l, m) for l in labels for m in models]
    out = {}
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futs = {pool.submit(extract, key, m, os.path.join(IMAGES_DIR, l["image"])): (l["image"], m)
                for l, m in jobs}
        done = 0
        for f in as_completed(futs):
            img, m = futs[f]
            out[(img, m)] = f.result()
            done += 1
            print(f"\r  {done}/{len(jobs)} extractions", end="", flush=True)
    print("\n")

    # score
    score = {m: {fld: [0, 0] for fld in fields} for m in models}  # [correct, total]
    print("=" * 78)
    print("PER-IMAGE (✗ = wrong vs ground truth)")
    print("=" * 78)
    for l in labels:
        print(f"\n{l['image']}")
        for m in models:
            r = out[(l["image"], m)]
            fl = flatten(r["data"]) if r.get("ok") else {}
            misses = []
            for fld in fields:
                truth = l.get(fld)
                pred = fl.get(FIELD_MAP[fld])
                ok = match(fld, truth, pred)
                score[m][fld][1] += 1
                if ok:
                    score[m][fld][0] += 1
                else:
                    misses.append(f"{fld}: got {pred!r} ≠ {truth!r}")
            tag = "✓ all" if not misses else "✗ " + "; ".join(misses)
            print(f"  {m:14s} {tag}")

    print("\n" + "=" * 78)
    print("ACCURACY vs PRD §12.1 TARGETS")
    print("=" * 78)
    header = "  field".ljust(20) + "".join(f"{m:>16}" for m in models) + "   target"
    print(header)
    for fld in fields:
        line = f"  {fld}".ljust(20)
        for m in models:
            c, t = score[m][fld]
            pct = c / t if t else 0
            tgt = TARGETS.get(fld)
            mark = "" if tgt is None else ("✓" if pct >= tgt else "✗")
            line += f"{c}/{t} {round(pct*100):>3}%{mark:>2}".rjust(16)
        line += f"   {int(TARGETS[fld]*100)}%" if fld in TARGETS else "   —"
        print(line)
    for m in models:
        tot = [sum(score[m][f][i] for f in fields) for i in (0, 1)]
        print(f"\n  {m}: {tot[0]}/{tot[1]} fields correct ({round(100*tot[0]/tot[1])}%)")


if __name__ == "__main__":
    main()
