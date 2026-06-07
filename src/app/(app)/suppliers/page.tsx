import Link from "next/link";
import { getSuppliers, isSupabaseConfigured } from "@/lib/data";
import { PageHeader, NotConfigured, Card, EmptyState } from "@/components/ui";
import { formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title="Suppliers" />
        <NotConfigured />
      </>
    );
  }
  const suppliers = (await getSuppliers()).sort((a, b) => b.total_spend - a.total_spend);

  return (
    <>
      <PageHeader title="Suppliers" subtitle={`${suppliers.length} supplier silo(s)`} />
      {suppliers.length === 0 ? (
        <EmptyState
          title="No suppliers yet"
          description="Suppliers are created as you link invoices during review. Approve a few invoices to populate this list."
        />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Supplier</th>
                <th className="px-4 py-2.5 font-medium">VAT No</th>
                <th className="px-4 py-2.5 font-medium text-right">Invoices</th>
                <th className="px-4 py-2.5 font-medium text-right">Total Spend</th>
                <th className="px-4 py-2.5 font-medium text-right">Avg Invoice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {suppliers.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <Link href={`/suppliers/${s.id}`} className="font-medium hover:text-primary">
                      {s.supplier_name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-muted">
                    {s.vat_numbers.length === 0 ? (
                      "—"
                    ) : (
                      <div className="space-y-0.5">
                        {s.vat_numbers.map((v) => (
                          <div key={v} className="tabular-nums">
                            {v}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{s.invoice_count}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                    {formatMoney(s.total_spend)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted">
                    {formatMoney(s.invoice_count ? s.total_spend / s.invoice_count : 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
