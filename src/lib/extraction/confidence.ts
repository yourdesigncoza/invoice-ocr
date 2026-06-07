import type { Extraction } from "./schema";
import { CONFIDENCE, type InvoiceStatus } from "@/lib/constants";

/**
 * Document confidence scoring (PRD §12). If the model supplied an overall
 * score we trust it; otherwise we derive one from the presence and per-field
 * confidence of the key fields (supplier, date, invoice no, total, VAT).
 */
export function scoreDocument(ex: Extraction): number {
  if (ex.confidence_score !== null) return clamp(ex.confidence_score);

  // weighted key fields (PRD §12 confidence factors)
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
