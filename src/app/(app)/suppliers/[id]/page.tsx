import { notFound } from "next/navigation";
import { getSupplier, getInvoices, isSupabaseConfigured } from "@/lib/data";
import { bucketKey } from "@/lib/periods";
import { PageHeader, NotConfigured, StatCard, Card } from "@/components/ui";
import { InvoiceTable } from "@/components/InvoiceTable";
import { formatMoney, formatDate, formatVat } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SupplierProfilePage(
  props: PageProps<"/suppliers/[id]">,
) {
  const { id } = await props.params;
  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title="Supplier" />
        <NotConfigured />
      </>
    );
  }

  const supplier = await getSupplier(id);
  if (!supplier) notFound();

  const invoices = await getInvoices({ supplierId: id, limit: 500 });
  const approved = invoices.filter((i) => i.status === "approved");
  const totalSpend = approved.reduce((s, i) => s + Number(i.total_incl_vat ?? 0), 0);
  const totalVat = approved.reduce((s, i) => s + Number(i.vat_amount ?? 0), 0);
  const lastDate = approved
    .map((i) => i.invoice_date)
    .filter(Boolean)
    .sort()
    .at(-1);

  // distinct VAT numbers detected across this supplier's invoices (+ stored)
  const vatNumbers = (() => {
    const seen = new Map<string, string>();
    for (const v of [supplier.vat_number, ...invoices.map((i) => i.vat_number)]) {
      const clean = formatVat(v);
      if (!clean) continue;
      const key = clean.replace(/\D/g, "");
      if (key && !seen.has(key)) seen.set(key, clean);
    }
    return [...seen.values()];
  })();

  // monthly spend silo (PRD §7.9)
  const byMonth = new Map<string, { count: number; spend: number; vat: number }>();
  for (const i of approved) {
    if (!i.invoice_date) continue;
    const key = bucketKey(i.invoice_date, "month");
    const b = byMonth.get(key) ?? { count: 0, spend: 0, vat: 0 };
    b.count += 1;
    b.spend += Number(i.total_incl_vat ?? 0);
    b.vat += Number(i.vat_amount ?? 0);
    byMonth.set(key, b);
  }

  return (
    <>
      <PageHeader
        title={supplier.supplier_name}
        subtitle={[
          vatNumbers.length ? `VAT ${vatNumbers.join(", ")}` : null,
          supplier.address,
        ]
          .filter(Boolean)
          .join(" · ")}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Spend" value={formatMoney(totalSpend)} hint="Approved" />
        <StatCard label="Invoices" value={approved.length} />
        <StatCard
          label="Avg Invoice"
          value={formatMoney(approved.length ? totalSpend / approved.length : 0)}
        />
        <StatCard label="VAT Captured" value={formatMoney(totalVat)} hint={lastDate ? `Last: ${formatDate(lastDate)}` : undefined} />
      </div>

      {byMonth.size > 0 && (
        <>
          <h2 className="mt-8 mb-3 text-sm font-semibold">Monthly trend</h2>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Month</th>
                  <th className="px-4 py-2.5 font-medium text-right">Invoices</th>
                  <th className="px-4 py-2.5 font-medium text-right">Spend</th>
                  <th className="px-4 py-2.5 font-medium text-right">VAT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[...byMonth.entries()].map(([month, b]) => (
                  <tr key={month}>
                    <td className="px-4 py-2.5">{month}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{b.count}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">{formatMoney(b.spend)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted">{formatMoney(b.vat)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      <h2 className="mt-8 mb-3 text-sm font-semibold">Invoices</h2>
      <InvoiceTable invoices={invoices} />
    </>
  );
}
