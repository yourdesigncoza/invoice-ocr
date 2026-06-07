#!/usr/bin/env python3
"""
Model comparison test bed — runs two (or more) vision models over the SAME
invoice scans using the EXACT production prompt + JSON schema, then diffs the
extracted fields. Non-destructive: touches no database or storage.

Mirrors src/lib/extraction/{prompt.ts,schema.ts}. If you change the production
prompt/schema, update the copies here and re-run (PRD §12.2 regression rule).

Usage:
  python3 eval/compare_models.py                       # all images, default models
  python3 eval/compare_models.py --limit 8             # first 8 images
  python3 eval/compare_models.py --models gpt-4o,gpt-5.4-mini
  python3 eval/compare_models.py --images "WhatsApp Unknown*/*.jpeg"
"""
import argparse, base64, glob, json, os, re, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ── constants (mirror src/lib/constants.ts) ──────────────────────────────
DOCUMENT_TYPES = ["Tax Invoice", "Receipt", "Cash Sale", "Purchase Notice",
                  "Prepaid Electricity", "Statement", "Unknown", "Not Invoice"]
PAYMENT_METHODS = ["Cash", "Card", "EFT", "Account", "COD", "Unknown"]

# ── system prompt (mirror src/lib/extraction/prompt.ts) ──────────────────
SYSTEM_PROMPT = f"""You are an invoice and receipt data extraction engine for a South African business.
You receive a photo, scan, or PDF page of an invoice, till slip, receipt, or supplier document — often messy: thermal slips, cropped or skewed phone photos, faded print, partial handwriting.

Extract the data into the required JSON schema. Follow these rules exactly:

1. NEVER invent values. If a field is not clearly present, return null. A wrong guess is worse than null.
2. Money values are numbers (e.g. 335.37), not strings. Strip currency symbols. Use a dot decimal separator.
3. Dates must be ISO format YYYY-MM-DD. Convert formats like 27/05/26 -> 2026-05-27. South African dates are day/month/year. If a date is ambiguous or unreadable, return null.
4. For each important field, also return the original detected text in "raw_value" and a "confidence" between 0 and 1 reflecting how legible/certain that specific field is.
5. Currency defaults to "ZAR" unless another currency is clearly shown.
6. Classify document_type as one of: {", ".join(DOCUMENT_TYPES)}. Choose the MOST SPECIFIC type that applies — e.g. use "Prepaid Electricity" for prepaid electricity / utility purchase slips, not the generic "Purchase Notice".
7. payment_method is one of: {", ".join(PAYMENT_METHODS)}, or null.
8. Provide supplier.raw_name exactly as printed, and supplier.normalized_name as a cleaned canonical form.
9. Extract line_items when legible; thermal-slip line items are often unreliable — when unsure, leave the array empty and add a warning rather than guessing.
10. Add human-readable "warnings" for anything that needs reviewer attention.
11. confidence_score is the overall document extraction confidence (0-1).

Return ONLY the JSON object. No prose."""

USER_PROMPT = "Extract the structured invoice data from this document following all rules."


def field(value_type):
    return {"type": "object", "additionalProperties": False,
            "required": ["value", "raw_value", "confidence"],
            "properties": {"value": {"type": value_type},
                           "raw_value": {"type": ["string", "null"]},
                           "confidence": {"type": ["number", "null"]}}}


SCHEMA = {
    "name": "invoice_extraction", "strict": True,
    "schema": {"type": "object", "additionalProperties": False,
        "required": ["document_type", "supplier", "invoice", "line_items", "warnings", "confidence_score"],
        "properties": {
            "document_type": {"type": "string", "enum": DOCUMENT_TYPES},
            "supplier": {"type": "object", "additionalProperties": False,
                "required": ["raw_name", "normalized_name", "vat_number", "phone", "address"],
                "properties": {k: {"type": ["string", "null"]} for k in
                               ["raw_name", "normalized_name", "vat_number", "phone", "address"]}},
            "invoice": {"type": "object", "additionalProperties": False,
                "required": ["invoice_number", "invoice_date", "due_date", "subtotal_excl_vat",
                             "vat_amount", "total_incl_vat", "currency_code", "payment_method",
                             "po_number", "reference_number"],
                "properties": {
                    "invoice_number": field(["string", "null"]),
                    "invoice_date": field(["string", "null"]),
                    "due_date": field(["string", "null"]),
                    "subtotal_excl_vat": field(["number", "null"]),
                    "vat_amount": field(["number", "null"]),
                    "total_incl_vat": field(["number", "null"]),
                    "currency_code": {"type": "string"},
                    "payment_method": {"type": ["string", "null"], "enum": PAYMENT_METHODS + [None]},
                    "po_number": {"type": ["string", "null"]},
                    "reference_number": {"type": ["string", "null"]}}},
            "line_items": {"type": "array", "items": {"type": "object", "additionalProperties": False,
                "required": ["description", "quantity", "unit_price", "line_total", "vat_rate", "category"],
                "properties": {"description": {"type": ["string", "null"]},
                               "quantity": {"type": ["number", "null"]},
                               "unit_price": {"type": ["number", "null"]},
                               "line_total": {"type": ["number", "null"]},
                               "vat_rate": {"type": ["number", "null"]},
                               "category": {"type": ["string", "null"]}}}},
            "warnings": {"type": "array", "items": {"type": "string"}},
            "confidence_score": {"type": ["number", "null"]}}}}


def load_key():
    env = dict(re.findall(r'^(\w+)=(.*)$', open(os.path.join(ROOT, ".env.local")).read(), re.M))
    return env["OPENAI_API_KEY"]


MAX_SIDE = 1568  # mirror src/lib/extraction/preprocess.ts


def preprocess_b64(img_path):
    """Downscale/auto-orient to match production preprocessing, return base64 JPEG."""
    try:
        from PIL import Image, ImageOps
        with Image.open(img_path) as probe:
            w, h = probe.size
        # already within the cap -> send original bytes untouched (mirror prod)
        if max(w, h) <= MAX_SIDE:
            return base64.b64encode(open(img_path, "rb").read()).decode()
        im = ImageOps.exif_transpose(Image.open(img_path))
        if im.mode not in ("RGB", "L"):
            im = im.convert("RGB")
        s = MAX_SIDE / max(w, h)
        im = im.resize((int(w * s), int(h * s)), Image.Resampling.LANCZOS)
        buf = __import__("io").BytesIO()
        im.save(buf, format="JPEG", quality=85)
        return base64.b64encode(buf.getvalue()).decode()
    except Exception:
        return base64.b64encode(open(img_path, "rb").read()).decode()


def extract(api_key, model, img_path):
    data = preprocess_b64(img_path)
    payload = {"model": model, "temperature": 0,
               "response_format": {"type": "json_schema", "json_schema": SCHEMA},
               "messages": [{"role": "system", "content": SYSTEM_PROMPT},
                            {"role": "user", "content": [
                                {"type": "text", "text": USER_PROMPT},
                                {"type": "image_url", "image_url": {
                                    "url": f"data:image/jpeg;base64,{data}", "detail": "high"}}]}]}
    body = json.dumps(payload).encode()
    req = urllib.request.Request("https://api.openai.com/v1/chat/completions", data=body,
                                 method="POST", headers={"Authorization": "Bearer " + api_key,
                                                         "Content-Type": "application/json"})
    t0 = time.time()
    try:
        r = json.load(urllib.request.urlopen(req, timeout=120))
        ms = int((time.time() - t0) * 1000)
        ex = json.loads(r["choices"][0]["message"]["content"])
        return {"ok": True, "ms": ms, "resolved": r.get("model"), "data": ex}
    except urllib.error.HTTPError as e:
        return {"ok": False, "ms": int((time.time() - t0) * 1000), "error": f"{e.code} {e.read().decode()[:160]}"}
    except Exception as e:
        return {"ok": False, "ms": int((time.time() - t0) * 1000), "error": str(e)[:160]}


def flatten(ex):
    """Pull the comparison-relevant fields out of a structured extraction."""
    if not ex:
        return {}
    s, inv = ex.get("supplier", {}), ex.get("invoice", {})
    fv = lambda d, k: (d.get(k) or {}).get("value")
    return {
        "doc_type": ex.get("document_type"),
        "supplier": s.get("normalized_name") or s.get("raw_name"),
        "phone": s.get("phone"),
        "address": (s.get("address") or "").replace("\n", " ").strip() or None,
        "vat_number": s.get("vat_number"),
        "invoice_no": fv(inv, "invoice_number"),
        "date": fv(inv, "invoice_date"),
        "subtotal": fv(inv, "subtotal_excl_vat"),
        "vat": fv(inv, "vat_amount"),
        "total": fv(inv, "total_incl_vat"),
        "confidence": ex.get("confidence_score"),
        "warnings": len(ex.get("warnings", [])),
    }


COMPARE_FIELDS = ["doc_type", "supplier", "phone", "address", "vat_number",
                  "invoice_no", "date", "subtotal", "vat", "total"]


def norm(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return round(float(v), 2)
    return re.sub(r"\s+", "", str(v).lower())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--images", default="WhatsApp Unknown*/*.jpeg")
    ap.add_argument("--models", default="gpt-4o,gpt-5.4-mini")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--out", default="")
    args = ap.parse_args()

    key = load_key()
    models = [m.strip() for m in args.models.split(",")]
    images = sorted(glob.glob(os.path.join(ROOT, args.images)))
    if args.limit:
        images = images[:args.limit]
    if not images:
        sys.exit("No images matched " + args.images)
    print(f"Models: {models}\nImages: {len(images)}  Workers: {args.workers}\n")

    # fan out every (image, model) call
    jobs = [(img, m) for img in images for m in models]
    raw = {}
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futs = {pool.submit(extract, key, m, img): (img, m) for img, m in jobs}
        done = 0
        for f in as_completed(futs):
            img, m = futs[f]
            raw[(img, m)] = f.result()
            done += 1
            print(f"\r  {done}/{len(jobs)} calls done", end="", flush=True)
    print("\n")

    results, agg = [], {m: {"ms": [], "conf": [], "fail": 0} for m in models}
    field_agree = {fld: 0 for fld in COMPARE_FIELDS}
    field_total = {fld: 0 for fld in COMPARE_FIELDS}

    for img in images:
        name = os.path.basename(img)
        per = {"image": name, "models": {}}
        flats = {}
        for m in models:
            r = raw[(img, m)]
            if r["ok"]:
                fl = flatten(r["data"])
                flats[m] = fl
                agg[m]["ms"].append(r["ms"])
                if fl.get("confidence") is not None:
                    agg[m]["conf"].append(fl["confidence"])
                per["models"][m] = {"resolved": r["resolved"], "ms": r["ms"], **fl}
            else:
                agg[m]["fail"] += 1
                per["models"][m] = {"error": r["error"], "ms": r["ms"]}
        # agreement between the first two models
        if len(models) >= 2 and all(m in flats for m in models[:2]):
            a, b = flats[models[0]], flats[models[1]]
            for fld in COMPARE_FIELDS:
                field_total[fld] += 1
                if norm(a.get(fld)) == norm(b.get(fld)):
                    field_agree[fld] += 1
        results.append(per)

    # ── report ───────────────────────────────────────────────────────────
    print("=" * 78)
    print("PER-IMAGE (▲ = models disagree on a key field)")
    print("=" * 78)
    for per in results:
        print(f"\n{per['image']}")
        for fld in ["supplier", "date", "total", "vat", "vat_number", "phone", "doc_type"]:
            vals = [per["models"].get(m, {}).get(fld) for m in models]
            flag = "▲" if len({norm(v) for v in vals}) > 1 else " "
            cells = "  |  ".join(f"{m.replace('gpt-', ''):>9}: {v}" for m, v in zip(models, vals))
            print(f"  {flag} {fld:11s} {cells}")

    print("\n" + "=" * 78)
    print("AGGREGATES")
    print("=" * 78)
    for m in models:
        ms, conf = agg[m]["ms"], agg[m]["conf"]
        avg_ms = sum(ms) // len(ms) if ms else 0
        avg_conf = round(sum(conf) / len(conf), 3) if conf else "—"
        print(f"  {m:16s} avg_latency={avg_ms}ms  avg_confidence={avg_conf}  failures={agg[m]['fail']}")
    if len(models) >= 2:
        print(f"\n  Field agreement ({models[0]} vs {models[1]}):")
        for fld in COMPARE_FIELDS:
            t = field_total[fld]
            pct = round(100 * field_agree[fld] / t) if t else 0
            print(f"    {fld:11s} {field_agree[fld]}/{t}  ({pct}%)")

    out = args.out or os.path.join(ROOT, "eval", "results.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    json.dump({"models": models, "images": len(images), "results": results,
               "aggregates": {m: {"avg_ms": (sum(agg[m]["ms"]) // len(agg[m]["ms"]) if agg[m]["ms"] else 0),
                                  "avg_conf": (round(sum(agg[m]["conf"]) / len(agg[m]["conf"]), 3) if agg[m]["conf"] else None),
                                  "failures": agg[m]["fail"]} for m in models},
               "field_agreement": {fld: {"agree": field_agree[fld], "total": field_total[fld]} for fld in COMPARE_FIELDS}},
              open(out, "w"), indent=2)
    print(f"\nFull results -> {out}")


if __name__ == "__main__":
    main()
