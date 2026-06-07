import type { Extraction } from "./schema";

export interface ValidationResult {
  warnings: string[];
  /** true → the document should not auto-pass to a clean state. */
  hardFail: boolean;
}

// Flag totals outside a sane range for SA supplier invoices/receipts.
const MAX_REASONABLE_TOTAL = 5_000_000;
const VAT_RECONCILE_TOLERANCE = 0.02; // 2 cents

/**
 * Deterministic business-rule validation (PRD §7.3.2). Runs after schema
 * validation, before the document reaches the review screen. Produces
 * plain-language warnings; never mutates the extraction.
 */
export function validateExtraction(ex: Extraction): ValidationResult {
  const warnings: string[] = [];
  let hardFail = false;

  const total = ex.invoice.total_incl_vat.value;
  const subtotal = ex.invoice.subtotal_excl_vat.value;
  const vat = ex.invoice.vat_amount.value;
  const isFormalInvoice = ex.document_type === "Tax Invoice";
  const isCreditOrRefund =
    /credit|refund/i.test(ex.document_type) ||
    ex.warnings.some((w) => /credit note|refund/i.test(w));

  // total exists
  if (total === null) {
    warnings.push("Total amount not found");
    hardFail = true;
  }

  // negative totals rejected unless credit note / refund
  if (total !== null && total < 0 && !isCreditOrRefund) {
    warnings.push("Negative total on a non-credit document");
    hardFail = true;
  }

  // outlier totals
  if (total !== null && total >= 0) {
    if (total === 0) warnings.push("Total is zero — verify");
    if (total > MAX_REASONABLE_TOTAL)
      warnings.push("Total is suspiciously high — verify");
  }

  // supplier present
  if (!ex.supplier.raw_name && !ex.supplier.normalized_name) {
    warnings.push("Supplier name not found");
  }

  // invoice date present
  if (ex.invoice.invoice_date.value === null) {
    warnings.push("Invoice date not found");
  }

  // invoice number on formal invoices
  if (isFormalInvoice && !ex.invoice.invoice_number.value) {
    warnings.push("Invoice number missing on a tax invoice");
  }

  // VAT reconciliation where subtotal + vat are both present
  if (subtotal !== null && vat !== null && total !== null) {
    if (Math.abs(subtotal + vat - total) > VAT_RECONCILE_TOLERANCE) {
      warnings.push(
        "VAT check failed: total does not equal subtotal + VAT — manual review required",
      );
    }
  } else if (vat === null) {
    warnings.push("VAT amount not clearly detected");
  }

  // VAT number expected on a tax invoice
  if (isFormalInvoice && !ex.supplier.vat_number) {
    warnings.push("VAT number missing on a tax invoice");
  }

  return { warnings, hardFail };
}
