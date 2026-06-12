import Link from "next/link";
import { getInvoices, isSupabaseConfigured } from "@/lib/data";
import { PageHeader, NotConfigured, StatCard, Card, Button } from "@/components/ui";
import { InvoiceTable } from "@/components/InvoiceTable";
import { formatMoney } from "@/lib/utils";
import { ArrowLeft, Download } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Report drill-down: the proper reporting table behind one period row on
 * /reports. Shows period KPIs, a per-supplier breakdown, and every approved
 * invoice in the window, with a CSV export scoped to the same range.
 */
export default async function ReportDetailPage(
  props: PageProps<"/reports/detail">,
) {
  const sp = await props.searchParams;
  const from = typeof sp.from === "string" ? sp.from : undefined;
  const to = typeof sp.to === "string" ? sp.to : undefined;
  const label = typeof sp.label === "string" ? sp.label : "Period";
  const group = typeof sp.group === "string" ? sp.group : "month";

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title={label} />
        <NotConfigured />
      </>
    );
  }

  const invoices = await getInvoices({ status: "approved", from, to, limit: 1000 });

  const spend = invoices.reduce((s, i) => s + Number(i.total_incl_vat ?? 0), 0);
  const vat = invoices.reduce((s, i) => s + Number(i.vat_amount ?? 0), 0);

  // per-supplier breakdown within the period
  const bySupplier = new Map<
    string,
    { count: number; spend: number; vat: number; lastDate: string }
  >();
  for (const i of invoices) {
    const name = i.supplier?.supplier_name || i.original_supplier_name || "Unknown";
    const b = bySupplier.get(name) ?? { count: 0, spend: 0, vat: 0, lastDate: "" };
    b.count += 1;
    b.spend += Number(i.total_incl_vat ?? 0);
    b.vat += Number(i.vat_amount ?? 0);
    if (i.invoice_date && i.invoice_date > b.lastDate) b.lastDate = i.invoice_date;
    bySupplier.set(name, b);
  }
  // latest-first, matching the invoices table below; spend breaks ties
  const supplierRows = [...bySupplier.entries()].sort((a, b) =>
    a[1].lastDate === b[1].lastDate
      ? b[1].spend - a[1].spend
      : a[1].lastDate < b[1].lastDate
        ? 1
        : -1,
  );

  const exportHref = `/api/export?status=approved${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`;

  return (
    <>
      <div className="mb-2">
        <Link
          href={`/reports?group=${group}`}
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Reports
        </Link>
      </div>
      <PageHeader
        title={label}
        subtitle={from && to ? `${from} → ${to} · approved invoices` : "Approved invoices"}
        action={
          <Button href={exportHref} variant="ghost">
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Spend" value={formatMoney(spend)} />
        <StatCard label="VAT" value={formatMoney(vat)} />
        <StatCard label="Invoices" value={invoices.length} />
        <StatCard
          label="Avg Invoice"
          value={formatMoney(invoices.length ? spend / invoices.length : 0)}
        />
      </div>

      {supplierRows.length > 0 && (
        <>
          <h2 className="mt-8 mb-3 text-sm font-semibold">Spend by supplier</h2>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[36rem]">
              <thead className="bg-slate-50 text-left text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Supplier</th>
                  <th className="px-4 py-2.5 font-medium text-right">Invoices</th>
                  <th className="px-4 py-2.5 font-medium text-right">Spend</th>
                  <th className="px-4 py-2.5 font-medium text-right">VAT</th>
                  <th className="px-4 py-2.5 font-medium text-right">% of total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {supplierRows.map(([name, b]) => (
                  <tr key={name} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium">{name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{b.count}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">{formatMoney(b.spend)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted">{formatMoney(b.vat)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted">
                      {spend ? Math.round((b.spend / spend) * 100) : 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </Card>
        </>
      )}

      <h2 className="mt-8 mb-3 text-sm font-semibold">Invoices in this period</h2>
      <InvoiceTable invoices={invoices} />
    </>
  );
}
