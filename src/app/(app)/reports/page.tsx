import Link from "next/link";
import { getInvoices, isSupabaseConfigured } from "@/lib/data";
import { bucketKey, bucketRange, type GroupBy } from "@/lib/periods";
import { ChevronRight } from "lucide-react";
import { PageHeader, NotConfigured, Card } from "@/components/ui";
import { formatMoney, cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const GROUPS: GroupBy[] = ["day", "week", "month", "quarter", "year"];

export default async function ReportsPage(props: PageProps<"/reports">) {
  const sp = await props.searchParams;
  const group = (typeof sp.group === "string" && GROUPS.includes(sp.group as GroupBy)
    ? sp.group
    : "month") as GroupBy;

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title="Reports" />
        <NotConfigured />
      </>
    );
  }

  const approved = await getInvoices({ status: "approved", limit: 1000 });

  // bucket spend/vat/count + top supplier per period
  const buckets = new Map<
    string,
    {
      spend: number;
      vat: number;
      count: number;
      date: string; // any date inside the bucket → used to derive its range
      suppliers: Map<string, number>;
    }
  >();
  for (const i of approved) {
    if (!i.invoice_date) continue;
    const key = bucketKey(i.invoice_date, group);
    const b =
      buckets.get(key) ??
      { spend: 0, vat: 0, count: 0, date: i.invoice_date, suppliers: new Map() };
    b.spend += Number(i.total_incl_vat ?? 0);
    b.vat += Number(i.vat_amount ?? 0);
    b.count += 1;
    const sup = i.supplier?.supplier_name || i.original_supplier_name || "Unknown";
    b.suppliers.set(sup, (b.suppliers.get(sup) ?? 0) + Number(i.total_incl_vat ?? 0));
    buckets.set(key, b);
  }
  // sort chronologically (newest first) by the bucket's date, not its label —
  // week/month labels don't string-sort in date order.
  const rows = [...buckets.entries()].sort((a, b) =>
    a[1].date < b[1].date ? 1 : -1,
  );

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Approved spend by time period (PRD §7.8)"
        action={
          <Link
            href={`/api/export?type=invoices&status=approved`}
            className="inline-flex items-center rounded-lg border border-border bg-surface px-3.5 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Export CSV
          </Link>
        }
      />

      <div className="flex items-center gap-1 mb-4">
        {GROUPS.map((g) => (
          <Link
            key={g}
            href={`/reports?group=${g}`}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm capitalize transition-colors",
              g === group ? "bg-foreground text-white" : "text-muted hover:bg-slate-100",
            )}
          >
            {g}
          </Link>
        ))}
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium capitalize">{group}</th>
              <th className="px-4 py-2.5 font-medium text-right">Spend</th>
              <th className="px-4 py-2.5 font-medium text-right">VAT</th>
              <th className="px-4 py-2.5 font-medium text-right">Invoices</th>
              <th className="px-4 py-2.5 font-medium">Top Supplier</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  No approved invoices yet.
                </td>
              </tr>
            )}
            {rows.map(([period, b]) => {
              const top = [...b.suppliers.entries()].sort((a, c) => c[1] - a[1])[0];
              const range = bucketRange(b.date, group);
              const href = `/reports/detail?group=${group}&from=${range.from}&to=${range.to}&label=${encodeURIComponent(period)}`;
              return (
                <tr key={period} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium">
                    <Link href={href} className="hover:text-primary">
                      {period}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium">{formatMoney(b.spend)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted">{formatMoney(b.vat)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{b.count}</td>
                  <td className="px-4 py-2.5 text-muted">{top ? top[0] : "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      href={href}
                      className="inline-flex items-center text-primary hover:underline whitespace-nowrap"
                    >
                      View <ChevronRight className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
