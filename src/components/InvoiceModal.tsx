"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { X, ExternalLink, Loader2, AlertTriangle } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { formatMoney, formatDate } from "@/lib/utils";
import type { InvoiceWithSupplier, InvoiceItem } from "@/lib/types";

/**
 * "View" trigger + invoice preview modal. Most fields come from the row the
 * table already has; the signed image URL and line items are lazy-fetched from
 * GET /api/invoices/[id] when opened. Editing still lives on the full review
 * screen — the modal links there.
 */
export function InvoiceModal({ invoice }: { invoice: InvoiceWithSupplier }) {
  const [open, setOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    fetch(`/api/invoices/${invoice.id}`)
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        setImageUrl(d.imageUrl ?? null);
        setIsPdf(Boolean(d.isPdf));
        setItems(d.items ?? []);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [open, invoice.id]);

  const supplierName =
    invoice.supplier?.supplier_name || invoice.original_supplier_name || "Unknown supplier";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-primary text-xs font-medium hover:underline"
      >
        View
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 text-left"
          onClick={close}
        >
          <div
            className="bg-surface rounded-xl shadow-2xl w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* header */}
            <div className="flex items-start justify-between gap-3 px-5 py-3.5 border-b border-border">
              <div className="min-w-0">
                <div className="font-semibold truncate">{supplierName}</div>
                <div className="mt-1 flex items-center gap-2">
                  <StatusBadge status={invoice.status} />
                  <ConfidenceBadge score={invoice.confidence_score} />
                </div>
              </div>
              <button
                onClick={close}
                className="text-muted hover:text-foreground shrink-0"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* body */}
            <div className="grid lg:grid-cols-2 overflow-auto">
              <div className="bg-slate-100 p-4 flex items-start justify-center min-h-48">
                {loading && !imageUrl ? (
                  <Loader2 className="h-6 w-6 text-muted animate-spin mt-10" />
                ) : !imageUrl ? (
                  <p className="text-sm text-muted mt-10">No file preview.</p>
                ) : isPdf ? (
                  <a
                    href={imageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary text-sm flex items-center gap-1 mt-10"
                  >
                    Open PDF <ExternalLink className="h-4 w-4" />
                  </a>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageUrl}
                    alt="Original invoice"
                    className="max-w-full rounded-lg shadow-sm ring-1 ring-black/5"
                  />
                )}
              </div>

              <div className="p-5 space-y-4">
                {invoice.warnings?.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2.5">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-status-review mb-1">
                      <AlertTriangle className="h-3.5 w-3.5" /> Warnings
                    </div>
                    <ul className="text-xs text-foreground/80 list-disc list-inside space-y-0.5">
                      {invoice.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <dl className="text-sm divide-y divide-border">
                  <Row label="Invoice date" value={formatDate(invoice.invoice_date)} />
                  <Row label="Invoice no" value={invoice.invoice_number || "—"} />
                  <Row label="Document type" value={invoice.document_type} />
                  <Row label="Payment method" value={invoice.payment_method || "—"} />
                  <Row label="Subtotal (excl VAT)" value={formatMoney(invoice.subtotal_excl_vat, invoice.currency_code)} />
                  <Row label="VAT" value={formatMoney(invoice.vat_amount, invoice.currency_code)} />
                  <Row label="Total (incl VAT)" value={formatMoney(invoice.total_incl_vat, invoice.currency_code)} strong />
                  <Row label="VAT number" value={invoice.vat_number || "—"} />
                </dl>

                {items.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                      Line items
                    </div>
                    <div className="rounded-lg border border-border overflow-hidden">
                      <table className="w-full text-xs">
                        <tbody className="divide-y divide-border">
                          {items.map((it) => (
                            <tr key={it.id}>
                              <td className="px-2.5 py-1.5">{it.description || "—"}</td>
                              <td className="px-2.5 py-1.5 text-right tabular-nums text-muted">
                                {it.quantity ?? ""}
                              </td>
                              <td className="px-2.5 py-1.5 text-right tabular-nums">
                                {formatMoney(it.line_total, invoice.currency_code)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* footer */}
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-border">
              {invoice.supplier ? (
                <Link
                  href={`/suppliers/${invoice.supplier.id}`}
                  className="text-sm text-muted hover:text-foreground"
                  onClick={close}
                >
                  View supplier →
                </Link>
              ) : (
                <span />
              )}
              <Link
                href={`/review/${invoice.id}`}
                className="inline-flex items-center gap-2 rounded-lg bg-primary text-white px-3.5 py-2 text-sm font-medium hover:bg-blue-700"
              >
                Open full review <ExternalLink className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <dt className="text-muted">{label}</dt>
      <dd className={strong ? "font-semibold tabular-nums" : "tabular-nums"}>{value}</dd>
    </div>
  );
}
