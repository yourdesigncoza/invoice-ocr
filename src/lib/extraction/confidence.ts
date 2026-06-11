import type { Extraction } from "./schema";
import { CONFIDENCE, type InvoiceStatus } from "@/lib/constants";

/**
 * Document confidence scoring (PRD §12). The model's self-reported score is
 * the signal LLMs are weakest at (it stays high even when a field is misread or
 * hallucinated), so we never trust it alone:
 *  1. take min(model score, field-presence-derived score) — self-report can
 *     lower the score but never raise it above what the fields actually support;
 *  2. apply a deterministic ceiling — when the document's own arithmetic is
 *     inconsistent (subtotal + VAT ≠ total) or both primary identity fields
 *     (supplier AND date) are missing, cap below `medium` so it lands in
 *     low_confidence regardless of what the model claimed.
 */
export function scoreDocument(
  ex: Extraction,
  signals: { reconcileFailed?: boolean } = {},
): number {
  const derived = deriveScore(ex);
  const base =
    ex.confidence_score !== null
      ? Math.min(clamp(ex.confidence_score), derived)
      : derived;

  const supplierMissing = !(ex.supplier.normalized_name || ex.supplier.raw_name);
  const dateMissing = ex.invoice.invoice_date.value === null;
  if (signals.reconcileFailed || (supplierMissing && dateMissing)) {
    // strictly below CONFIDENCE.medium → deriveStatus() returns low_confidence
    return Math.min(base, CONFIDENCE.medium - 0.01);
  }
  return base;
}

/** Weighted field-presence score (PRD §12 confidence factors). */
function deriveScore(ex: Extraction): number {
  const factors: Array<{ present: boolean; conf: number | null; weight: number }> = [
    { present: !!(ex.supplier.normalized_name || ex.supplier.raw_name), conf: null, weight: 0.2 },
    { present: ex.invoice.invoice_date.value !== null, conf: ex.invoice.invoice_date.confidence, weight: 0.15 },
    { present: ex.invoice.invoice_number.value !== null, conf: ex.invoice.invoice_number.confidence, weight: 0.1 },
    { present: ex.invoice.total_incl_vat.value !== null, conf: ex.invoice.total_incl_vat.confidence, weight: 0.4 },
    { present: ex.invoice.vat_amount.value !== null, conf: ex.invoice.vat_amount.confidence, weight: 0.15 },
  ];

  let score = 0;
  for (const f of factors) {
    if (!f.present) continue;
    score += f.weight * (f.conf ?? 0.8); // assume 0.8 when field-level conf absent
  }
  return clamp(score);
}

/**
 * Decide the initial review status from confidence + hard validation failure.
 * Nothing is ever auto-approved (PRD §3) — high confidence still lands in
 * needs_review, just flagged as quick to approve.
 */
export function deriveStatus(score: number, hardFail: boolean): InvoiceStatus {
  if (hardFail || score < CONFIDENCE.medium) return "low_confidence";
  return "needs_review";
}

function clamp(n: number): number {
  return Math.max(0, Math.min(1, n));
}
