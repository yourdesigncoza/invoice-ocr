import type { InvoiceWithSupplier } from "@/lib/types";

/** RFC-4180-ish CSV cell escaping. */
function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => cell(row[h])).join(","));
  }
  return lines.join("\n");
}

/** Flatten invoices into the bookkeeping export shape (PRD §7.12). */
export function invoicesToRows(invoices: InvoiceWithSupplier[]) {
  return invoices.map((i) => ({
    status: i.status,
    invoice_date: i.invoice_date ?? "",
    supplier: i.supplier?.supplier_name || i.original_supplier_name || "",
    invoice_number: i.invoice_number ?? "",
    document_type: i.document_type,
    subtotal_excl_vat: i.subtotal_excl_vat ?? "",
    vat_amount: i.vat_amount ?? "",
    total_incl_vat: i.total_incl_vat ?? "",
    currency: i.currency_code,
    payment_method: i.payment_method ?? "",
    vat_number: i.vat_number ?? "",
    confidence: i.confidence_score ?? "",
  }));
}
