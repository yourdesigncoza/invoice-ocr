import type { InvoiceWithSupplier, InvoiceSiteAllocation } from "@/lib/types";
import { formatVat } from "@/lib/utils";
import { bucketKey } from "@/lib/periods";

const round2 = (n: number) => Math.round(n * 100) / 100;

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

/**
 * Flatten invoices into the bookkeeping export shape (PRD §7.12).
 * With `allocationsByInvoice`, a site-split invoice fans out to one row per
 * allocation (site + site_amount), so per-site pivots sum correctly; invoice-
 * level columns repeat verbatim on each of its rows. `site_amount` falls back
 * to the invoice total so the column stays summable for unsited invoices.
 */
export function invoicesToRows(
  invoices: InvoiceWithSupplier[],
  allocationsByInvoice?: Map<string, InvoiceSiteAllocation[]>,
) {
  const base = (i: InvoiceWithSupplier) => ({
    status: i.status,
    invoice_date: i.invoice_date ?? "",
    supplier: i.supplier?.supplier_name || i.original_supplier_name || "",
    site: i.project?.name ?? "",
    site_amount: round2(Number(i.total_incl_vat ?? 0)),
    invoice_number: i.invoice_number ?? "",
    document_type: i.document_type,
    subtotal_excl_vat: i.subtotal_excl_vat ?? "",
    vat_amount: i.vat_amount ?? "",
    total_incl_vat: i.total_incl_vat ?? "",
    currency: i.currency_code,
    payment_method: i.payment_method ?? "",
    vat_number: formatVat(i.vat_number) ?? "",
    confidence: i.confidence_score ?? "",
  });

  return invoices.flatMap((i) => {
    const allocs = allocationsByInvoice?.get(i.id);
    if (!allocs?.length) return [base(i)];
    return allocs.map((a) => ({
      ...base(i),
      site: a.project?.name ?? "",
      site_amount: round2(Number(a.amount)),
    }));
  });
}

/**
 * VAT summary export (PRD §7.12): roll invoices up to one row per month with
 * subtotal / input VAT / total, plus a TOTAL row — the shape an accountant
 * files (SA VAT201 input tax). Run over approved invoices in a date range.
 */
export function vatSummaryRows(invoices: InvoiceWithSupplier[]) {
  const byPeriod = new Map<
    string,
    { date: string; count: number; subtotal: number; vat: number; total: number; withVat: number }
  >();
  for (const i of invoices) {
    if (!i.invoice_date) continue;
    const key = bucketKey(i.invoice_date, "month");
    const b =
      byPeriod.get(key) ??
      { date: i.invoice_date, count: 0, subtotal: 0, vat: 0, total: 0, withVat: 0 };
    b.count += 1;
    b.subtotal += Number(i.subtotal_excl_vat ?? 0);
    b.vat += Number(i.vat_amount ?? 0);
    b.total += Number(i.total_incl_vat ?? 0);
    if (Number(i.vat_amount ?? 0) > 0) b.withVat += 1;
    if (i.invoice_date < b.date) b.date = i.invoice_date;
    byPeriod.set(key, b);
  }

  const rows = [...byPeriod.entries()]
    .sort((a, b) => (a[1].date < b[1].date ? -1 : 1))
    .map(([period, b]) => ({
      period,
      invoices: b.count,
      invoices_with_vat: b.withVat,
      subtotal_excl_vat: round2(b.subtotal),
      vat_amount: round2(b.vat),
      total_incl_vat: round2(b.total),
    }));

  if (rows.length) {
    rows.push({
      period: "TOTAL",
      invoices: rows.reduce((s, r) => s + r.invoices, 0),
      invoices_with_vat: rows.reduce((s, r) => s + r.invoices_with_vat, 0),
      subtotal_excl_vat: round2(rows.reduce((s, r) => s + r.subtotal_excl_vat, 0)),
      vat_amount: round2(rows.reduce((s, r) => s + r.vat_amount, 0)),
      total_incl_vat: round2(rows.reduce((s, r) => s + r.total_incl_vat, 0)),
    });
  }
  return rows;
}
