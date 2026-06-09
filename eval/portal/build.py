#!/usr/bin/env python3
"""
Build the LOCAL verification portal (plaintext, opens via file://).

  python3 eval/portal/build.py [--model gpt-4o] [--workers 6]

What it does (non-destructive to the source images):
  1. Copies ../demo-receipts/*.jpeg into eval/portal/images/ as 001.jpeg…
     (zero-padded, sorted by original filename) + writes manifest mapping
     number -> original filename.
  2. Runs the PRODUCTION extractor (same prompt/schema/preprocessing as the app,
     via compare_models.extract) over every image → captured.json.
  3. Generates a self-contained eval/portal/index.html from template.html with
     the captured data inlined (images referenced as local files). Open by
     double-click. You confirm/correct each field by eye, then Export a JSON we
     fold into eval/labels.json and re-run eval/score_models.py.

For an ENCRYPTED, online-deployable build (passcode-gated, images bundled), run
eval/portal/seal.mjs after this. Both share template.html.
"""
import argparse, glob, json, os, shutil, sys
from concurrent.futures import ThreadPoolExecutor, as_completed

HERE = os.path.dirname(os.path.abspath(__file__))
EVAL = os.path.dirname(HERE)
ROOT = os.path.dirname(EVAL)
sys.path.insert(0, EVAL)
from compare_models import load_key, extract, flatten  # noqa: E402

SRC_DIR = os.path.join(ROOT, "demo-receipts")
IMG_OUT = os.path.join(HERE, "images")

DOC_TYPES = ["Tax Invoice", "Receipt", "Cash Sale", "Purchase Notice",
             "Prepaid Electricity", "Statement", "Unknown", "Not Invoice"]


def capture(ex):
    """Flatten a structured extraction into the fields the portal shows."""
    f = flatten(ex) if ex else {}
    items = []
    for it in (ex or {}).get("line_items", []) or []:
        items.append({
            "description": it.get("description"),
            "quantity": it.get("quantity"),
            "unit_price": it.get("unit_price"),
            "line_total": it.get("line_total"),
        })
    return {
        "supplier": f.get("supplier"),
        "invoice_date": f.get("date"),
        "document_type": f.get("doc_type"),
        "total_incl_vat": f.get("total"),
        "vat_amount": f.get("vat"),
        "invoice_number": f.get("invoice_no"),
        "vat_number": f.get("vat_number"),
        "subtotal_excl_vat": f.get("subtotal"),
        "confidence": f.get("confidence"),
        "warnings": (ex or {}).get("warnings", []),
        "line_items": items,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="gpt-4o")
    ap.add_argument("--workers", type=int, default=6)
    args = ap.parse_args()

    imgs = sorted(glob.glob(os.path.join(SRC_DIR, "*.jpeg")) +
                  glob.glob(os.path.join(SRC_DIR, "*.jpg")) +
                  glob.glob(os.path.join(SRC_DIR, "*.png")))
    if not imgs:
        sys.exit(f"No images in {SRC_DIR}")
    print(f"{len(imgs)} source images. Model: {args.model}")

    # 1. copy + number
    os.makedirs(IMG_OUT, exist_ok=True)
    for f in os.listdir(IMG_OUT):
        os.remove(os.path.join(IMG_OUT, f))
    manifest = []
    for i, src in enumerate(imgs, 1):
        ext = os.path.splitext(src)[1].lower()
        num = f"{i:03d}"
        dst_name = num + ext
        shutil.copy2(src, os.path.join(IMG_OUT, dst_name))
        manifest.append({"num": num, "file": dst_name,
                         "original": os.path.basename(src)})

    # 2. OCR (parallel)
    key = load_key()
    results = {}
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futs = {pool.submit(extract, key, args.model,
                            os.path.join(SRC_DIR, m["original"])): m["num"]
                for m in manifest}
        done = 0
        for fut in as_completed(futs):
            results[futs[fut]] = fut.result()
            done += 1
            print(f"\r  OCR {done}/{len(manifest)}", end="", flush=True)
    print()

    records = []
    for m in manifest:
        r = results.get(m["num"], {})
        records.append({**m,
                        "ok": bool(r.get("ok")),
                        "error": r.get("error"),
                        "ms": r.get("ms"),
                        "captured": capture(r.get("data")) if r.get("ok") else None})

    json.dump(manifest, open(os.path.join(HERE, "manifest.json"), "w"), indent=2)
    json.dump(records, open(os.path.join(HERE, "captured.json"), "w"), indent=2)

    # 3. local index.html from the shared template (plaintext; images as files)
    data_blob = json.dumps({"model": args.model, "docTypes": DOC_TYPES,
                            "records": records}, ensure_ascii=False)
    template = open(os.path.join(HERE, "template.html")).read()
    html = template.replace("/*__BOOTSTRAP__*/", f"init({data_blob});")
    open(os.path.join(HERE, "index.html"), "w").write(html)
    ok = sum(1 for r in records if r["ok"])
    print(f"OCR ok: {ok}/{len(records)}. Local portal → eval/portal/index.html")


if __name__ == "__main__":
    main()
