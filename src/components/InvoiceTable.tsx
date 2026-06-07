import { StatusBadge } from "@/components/StatusBadge";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { InvoiceModal } from "@/components/InvoiceModal";
import { formatMoney, formatDate } from "@/lib/utils";
import type { InvoiceWithSupplier } from "@/lib/types";

/** Airtable-style invoice register table (PRD §7.6). */
export function InvoiceTable({ invoices }: { invoices: InvoiceWithSupplier[] }) {
  if (invoices.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-12 text-center text-sm text-muted">
        No invoices match these filters.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-muted">
            <tr>
              <Th>Status</Th>
              <Th>Date</Th>
              <Th>Supplier</Th>
              <Th>Invoice No</Th>
              <Th>Type</Th>
              <Th className="text-right">Total</Th>
              <Th className="text-right">VAT</Th>
              <Th className="text-right">Confidence</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {invoices.map((inv) => (
              <tr key={inv.id} className="hover:bg-slate-50">
                <Td><StatusBadge status={inv.status} /></Td>
                <Td className="text-muted whitespace-nowrap">{formatDate(inv.invoice_date)}</Td>
                <Td className="font-medium">
                  {inv.supplier?.supplier_name || inv.original_supplier_name || "Unknown"}
                </Td>
                <Td className="text-muted">{inv.invoice_number || "—"}</Td>
                <Td className="text-muted whitespace-nowrap">{inv.document_type}</Td>
                <Td className="text-right tabular-nums font-medium">
                  {formatMoney(inv.total_incl_vat, inv.currency_code)}
                </Td>
                <Td className="text-right tabular-nums text-muted">
                  {formatMoney(inv.vat_amount, inv.currency_code)}
                </Td>
                <Td className="text-right"><ConfidenceBadge score={inv.confidence_score} /></Td>
                <Td className="text-right">
                  <InvoiceModal invoice={inv} />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-2.5 font-medium ${className}`}>{children}</th>;
}
function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-2.5 ${className}`}>{children}</td>;
}
