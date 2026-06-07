import Link from "next/link";
import { getOpenDuplicates, isSupabaseConfigured } from "@/lib/data";
import { PageHeader, NotConfigured, EmptyState, Card } from "@/components/ui";
import { formatMoney, formatDate } from "@/lib/utils";
import { Copy } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DuplicatesPage() {
  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title="Duplicates" />
        <NotConfigured />
      </>
    );
  }
  const dupes = await getOpenDuplicates();

  return (
    <>
      <PageHeader
        title="Duplicates"
        subtitle={`${dupes.length} possible duplicate(s) to resolve`}
      />
      {dupes.length === 0 ? (
        <EmptyState
          title="No duplicate warnings"
          description="Duplicate checks run automatically before approval. Flagged pairs will appear here."
        />
      ) : (
        <div className="space-y-3">
          {dupes.map((d) => (
            <Card key={d.id} className="p-4">
              <div className="flex items-center gap-2 text-status-duplicate text-xs font-medium mb-2">
                <Copy className="h-4 w-4" />
                {Math.round(Number(d.match_score) * 100)}% · {d.match_reason}
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {[d.invoice, d.possible_duplicate].map((inv, i) =>
                  inv ? (
                    <Link
                      key={i}
                      href={`/review/${inv.id}`}
                      className="rounded-lg border border-border p-3 hover:border-primary"
                    >
                      <div className="font-medium">{inv.original_supplier_name || "Unknown"}</div>
                      <div className="text-xs text-muted mt-0.5">
                        {formatDate(inv.invoice_date)} · {inv.invoice_number || "no number"}
                      </div>
                      <div className="mt-1 font-semibold tabular-nums">
                        {formatMoney(inv.total_incl_vat, inv.currency_code)}
                      </div>
                    </Link>
                  ) : (
                    <div key={i} />
                  ),
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
