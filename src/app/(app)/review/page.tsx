import Link from "next/link";
import { getInvoices, isSupabaseConfigured } from "@/lib/data";
import { PageHeader, Card, NotConfigured, EmptyState, Button } from "@/components/ui";
import { StatusBadge } from "@/components/StatusBadge";
import { DuplicateBadge } from "@/components/DuplicateBadge";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { formatMoney, formatDate } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ReviewQueuePage() {
  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title="Review Queue" />
        <NotConfigured />
      </>
    );
  }

  const queue = await getInvoices({
    status: ["needs_review", "low_confidence", "processing"],
    limit: 100,
  });

  return (
    <>
      <PageHeader
        title="Review Queue"
        subtitle={`${queue.length} document(s) awaiting review`}
        action={<Button href="/upload">Upload more</Button>}
      />
      {queue.length === 0 ? (
        <EmptyState
          title="Queue is clear"
          description="No documents waiting for review. Upload a batch to get started."
          action={<Button href="/upload">Upload invoices</Button>}
        />
      ) : (
        <Card className="divide-y divide-border">
          {queue.map((inv) => (
            <Link
              key={inv.id}
              href={`/review/${inv.id}`}
              className={
                inv.duplicate_count
                  ? "flex items-start gap-3 p-4 bg-orange-50/50 hover:bg-orange-50"
                  : "flex items-start gap-3 p-4 hover:bg-slate-50"
              }
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
                  {inv.document_type} · {formatDate(inv.invoice_date)} ·{" "}
                  {inv.invoice_number || "no number"}
                </div>
                {inv.warnings?.length > 0 && (
                  <div className="text-xs text-status-low mt-0.5">
                    {inv.warnings[0]}
                    {inv.warnings.length > 1 && ` (+${inv.warnings.length - 1})`}
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end shrink-0">
                <span className="text-sm font-semibold tabular-nums">
                  {formatMoney(inv.total_incl_vat, inv.currency_code)}
                </span>
                <div className="mt-1">
                  <ConfidenceBadge score={inv.confidence_score} />
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted shrink-0 self-center" />
            </Link>
          ))}
        </Card>
      )}
    </>
  );
}
