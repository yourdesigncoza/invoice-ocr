import Link from "next/link";
import { getDashboard, getInvoices, isSupabaseConfigured } from "@/lib/data";
import { PageHeader, StatCard, Card, NotConfigured, Button } from "@/components/ui";
import { StatusBadge } from "@/components/StatusBadge";
import { DuplicateBadge } from "@/components/DuplicateBadge";
import { InvoiceModal } from "@/components/InvoiceModal";
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
        <Card className="mt-6 p-4 flex items-center gap-3 border-brand-yellow/40 bg-brand-yellow/[0.08]">
          <AlertTriangle className="h-5 w-5 text-status-review shrink-0" />
          <div className="text-sm text-foreground">
            <span className="font-semibold">{data?.pendingReview} document(s)</span>{" "}
            waiting for review.{" "}
            <Link
              href="/review"
              className="group/link inline-flex items-center gap-1 font-semibold text-[#1572a8] transition-colors hover:text-[#106191]"
            >
              Open the review queue
              <span className="transition-transform group-hover/link:translate-x-0.5">→</span>
            </Link>
          </div>
        </Card>
      )}

      <h2 className="mt-8 mb-3 text-sm font-semibold text-foreground">
        Recent invoices
      </h2>
      <Card className="overflow-hidden">
        {recent.length === 0 ? (
          <div className="px-4 py-8 text-center text-muted">
            No invoices yet — upload your first batch.
          </div>
        ) : (
          <>
            {/* desktop: full table */}
            <table className="hidden w-full text-sm md:table">
              <thead className="border-b border-border bg-slate-50/60 text-left">
                <tr className="[&>th]:px-3.5 [&>th]:py-2 [&>th]:text-[11px] [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-[0.05em] [&>th]:text-muted">
                  <th>Status</th>
                  <th>Date</th>
                  <th>Supplier</th>
                  <th className="text-right">Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {recent.map((inv) => (
                  <tr
                    key={inv.id}
                    className={
                      inv.duplicate_count
                        ? "bg-orange-50/50 transition-colors hover:bg-orange-50"
                        : "transition-colors hover:bg-brand-blue/[0.04]"
                    }
                  >
                    <td className="px-3.5 py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={inv.status} />
                        <DuplicateBadge count={inv.duplicate_count} />
                      </div>
                    </td>
                    <td className="px-3.5 py-2 text-muted">{formatDate(inv.invoice_date)}</td>
                    <td className="px-3.5 py-2 font-medium">
                      {inv.supplier?.supplier_name ||
                        inv.original_supplier_name ||
                        "Unknown supplier"}
                    </td>
                    <td className="px-3.5 py-2 text-right tabular-nums font-semibold">
                      {formatMoney(inv.total_incl_vat, inv.currency_code)}
                    </td>
                    <td className="px-3.5 py-2 text-right">
                      <InvoiceModal invoice={inv} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* mobile: stacked cards */}
            <div className="divide-y divide-border md:hidden">
              {recent.map((inv) => (
                <div
                  key={inv.id}
                  className={inv.duplicate_count ? "flex items-start gap-3 p-4 bg-orange-50/50" : "flex items-start gap-3 p-4"}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge status={inv.status} />
                      <DuplicateBadge count={inv.duplicate_count} />
                      <span className="text-sm font-medium">
                        {inv.supplier?.supplier_name ||
                          inv.original_supplier_name ||
                          "Unknown supplier"}
                      </span>
                    </div>
                    <div className="text-xs text-muted mt-1">
                      {formatDate(inv.invoice_date)}
                    </div>
                  </div>
                  <div className="flex flex-col items-end shrink-0">
                    <span className="text-sm font-semibold tabular-nums">
                      {formatMoney(inv.total_incl_vat, inv.currency_code)}
                    </span>
                    <div className="mt-1">
                      <InvoiceModal invoice={inv} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
    </>
  );
}
