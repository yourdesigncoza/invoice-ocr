import { NextRequest, NextResponse } from "next/server";
import { getInvoices } from "@/lib/data";
import { toCsv, invoicesToRows } from "@/lib/export/csv";
import type { InvoiceStatus } from "@/lib/constants";

export const runtime = "nodejs";

/**
 * CSV export for bookkeeping (PRD §7.12). Honours the same filters as the
 * register so "export this filtered list" works.
 *   /api/export?type=invoices&status=approved&from=2026-05-01&to=2026-05-31
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const status = sp.get("status") as InvoiceStatus | null;
  const invoices = await getInvoices({
    status: status ?? undefined,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
    search: sp.get("q") ?? undefined,
    limit: 5000,
  });

  const csv = toCsv(invoicesToRows(invoices));
  const name = `invoices-${status ?? "all"}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
