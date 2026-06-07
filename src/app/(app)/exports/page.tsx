import { PageHeader, Card } from "@/components/ui";
import { Download } from "lucide-react";

// Export types (PRD §7.12). Each is a CSV download from the export route.
const EXPORTS = [
  { label: "All approved invoices", href: "/api/export?type=invoices&status=approved" },
  { label: "All invoices", href: "/api/export?type=invoices" },
  { label: "Needs review", href: "/api/export?type=invoices&status=needs_review" },
  { label: "Low confidence", href: "/api/export?type=invoices&status=low_confidence" },
  { label: "Rejected", href: "/api/export?type=invoices&status=rejected" },
];

export default function ExportsPage() {
  return (
    <>
      <PageHeader
        title="Exports"
        subtitle="Download clean invoice data for Excel or your bookkeeping system"
      />
      <Card className="divide-y divide-border">
        {EXPORTS.map((e) => (
          <a
            key={e.href}
            href={e.href}
            className="flex items-center justify-between px-4 py-3.5 hover:bg-slate-50"
          >
            <span className="text-sm font-medium">{e.label}</span>
            <Download className="h-4 w-4 text-muted" />
          </a>
        ))}
      </Card>
      <p className="mt-4 text-xs text-muted">
        CSV opens directly in Excel. Filtered exports (by supplier, date range)
        are available from the{" "}
        <a href="/invoices" className="text-primary hover:underline">
          invoice register
        </a>
        .
      </p>
    </>
  );
}
