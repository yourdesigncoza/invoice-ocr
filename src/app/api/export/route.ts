import { NextRequest, NextResponse } from "next/server";
import { getInvoices, getAllocationsByInvoice } from "@/lib/data";
import { getUser } from "@/lib/auth-guards";
import { toCsv, invoicesToRows, vatSummaryRows } from "@/lib/export/csv";
import type { InvoiceStatus } from "@/lib/constants";

export const runtime = "nodejs";

/**
 * CSV export for bookkeeping (PRD §7.12). Honours the same filters as the
 * register. `type=vat_summary` rolls up to one row per month (+ TOTAL) for
 * filing; otherwise exports invoices line by line.
 *   /api/export?type=vat_summary&status=approved&from=2026-03-01&to=2026-04-30
 */
export async function GET(req: NextRequest) {
  if (!(await getUser()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const status = sp.get("status") as InvoiceStatus | null;
  const type = sp.get("type");
  const from = sp.get("from") ?? undefined;
  const to = sp.get("to") ?? undefined;
  const invoices = await getInvoices({
    status: status ?? undefined,
    from,
    to,
    search: sp.get("q") ?? undefined,
    limit: 5000,
  });

  const isVat = type === "vat_summary";
  // per-allocation fan-out for the register export only — the VAT summary is
  // invoice-level (a split invoice must count once per month, not per site)
  const allocations = isVat
    ? undefined
    : await getAllocationsByInvoice(invoices.map((i) => i.id));
  const csv = toCsv(
    isVat ? vatSummaryRows(invoices) : invoicesToRows(invoices, allocations),
  );
  const range = from || to ? `-${from ?? "start"}_${to ?? "today"}` : "";
  const name = isVat
    ? `vat-summary${range}.csv`
    : `invoices-${status ?? "all"}${range}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
