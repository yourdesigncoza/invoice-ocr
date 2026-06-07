import Link from "next/link";
import { getDashboard, getInvoices, isSupabaseConfigured } from "@/lib/data";
import { PageHeader, StatCard, Card, NotConfigured, Button } from "@/components/ui";
import { StatusBadge } from "@/components/StatusBadge";
import { formatMoney, formatDate } from "@/lib/utils";
import { AlertTriangle, Upload } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title="Dashboard" subtitle="Spend, VAT, and review overview" />
        <NotConfigured />
      </>
    );
  }

  const [data, recent] = await Promise.all([
    getDashboard(),
    getInvoices({ limit: 8 }),
  ]);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Approved spend, VAT, and what needs attention"
        action={
          <Button href="/upload">
            <Upload className="h-4 w-4" /> Upload invoices
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Spend" value={formatMoney(data?.totalSpend ?? 0)} hint="Approved, all time" />
        <StatCard label="Total VAT" value={formatMoney(data?.totalVat ?? 0)} />
        <StatCard label="Invoices" value={data?.invoiceCount ?? 0} hint="Approved" />
        <StatCard label="Avg Invoice" value={formatMoney(data?.avgInvoice ?? 0)} />
        <StatCard
          label="Pending Review"
          value={data?.pendingReview ?? 0}
          accent="#f59e0b"
        />
        <StatCard
          label="Duplicate Warnings"
          value={data?.duplicateWarnings ?? 0}
          accent="#ea580c"
        />
        <StatCard
          label="Top Supplier"
          value={data?.topSupplier?.name ?? "—"}
          hint={data?.topSupplier ? formatMoney(data.topSupplier.spend) : undefined}
        />
        <StatCard
          label="Unmatched Suppliers"
          value={data?.unmatchedSuppliers ?? 0}
        />
      </div>

      {(data?.pendingReview ?? 0) > 0 && (
        <Card className="mt-6 p-4 flex items-center gap-3 border-amber-200 bg-amber-50/60">
          <AlertTriangle className="h-5 w-5 text-status-review shrink-0" />
          <div className="text-sm text-foreground">
            <span className="font-medium">{data?.pendingReview} document(s)</span>{" "}
            waiting for review.{" "}
            <Link href="/review" className="text-primary font-medium hover:underline">
              Open the review queue →
            </Link>
          </div>
        </Card>
      )}

      <h2 className="mt-8 mb-3 text-sm font-semibold text-foreground">
        Recent invoices
      </h2>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Date</th>
              <th className="px-4 py-2.5 font-medium">Supplier</th>
              <th className="px-4 py-2.5 font-medium text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {recent.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">
                  No invoices yet — upload your first batch.
                </td>
              </tr>
            )}
            {recent.map((inv) => (
              <tr key={inv.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5">
                  <StatusBadge status={inv.status} />
                </td>
                <td className="px-4 py-2.5 text-muted">{formatDate(inv.invoice_date)}</td>
                <td className="px-4 py-2.5">
                  <Link href={`/review/${inv.id}`} className="hover:text-primary">
                    {inv.supplier?.supplier_name ||
                      inv.original_supplier_name ||
                      "Unknown supplier"}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                  {formatMoney(inv.total_incl_vat, inv.currency_code)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
