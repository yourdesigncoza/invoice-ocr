"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  X,
  ExternalLink,
  Loader2,
  AlertTriangle,
  Pencil,
  Save,
  ChevronDown,
  ChevronRight,
  Phone,
  Copy,
  Check,
  Trash2,
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { formatMoney, formatDate, formatVat } from "@/lib/utils";
import { DOCUMENT_TYPES, PAYMENT_METHODS } from "@/lib/constants";
import type { InvoiceWithSupplier, InvoiceItem, Project } from "@/lib/types";

/**
 * "View" trigger + invoice preview modal. Most fields come from the row the
 * table already has; the signed image URL and line items are lazy-fetched from
 * GET /api/invoices/[id] when opened.
 *
 * Inline Edit toggle lets reviewers correct extracted fields without leaving
 * their context. It saves through the SAME PATCH /api/invoices/[id] handler as
 * the full review screen, so every change is audit-logged. The full review
 * screen remains the home of the heavier workflow (supplier linking, approve/
 * reject, image preview).
 */

type FieldType = "text" | "number" | "date" | "select" | "textarea";
type Field = {
  key: string;
  label: string;
  type: FieldType;
  options?: readonly string[];
  money?: boolean;
  meta?: boolean; // shown in the collapsible "Supplier details" section
};
const FIELDS: Field[] = [
  { key: "invoice_date", label: "Invoice date", type: "date" },
  { key: "invoice_number", label: "Invoice no", type: "text" },
  { key: "document_type", label: "Document type", type: "select", options: DOCUMENT_TYPES },
  { key: "payment_method", label: "Payment method", type: "select", options: PAYMENT_METHODS },
  { key: "subtotal_excl_vat", label: "Subtotal (excl VAT)", type: "number", money: true },
  { key: "vat_amount", label: "VAT", type: "number", money: true },
  { key: "total_incl_vat", label: "Total (incl VAT)", type: "number", money: true },
  { key: "vat_number", label: "VAT number", type: "text" },
  // supplier metadata (PRD §7.2) — collapsible
  { key: "phone", label: "Tel", type: "text", meta: true },
  { key: "address", label: "Address", type: "textarea", meta: true },
];
const MAIN_FIELDS = FIELDS.filter((f) => !f.meta);
const META_FIELDS = FIELDS.filter((f) => f.meta);

function initValues(invoice: InvoiceWithSupplier): Record<string, string> {
  const v: Record<string, string> = {};
  for (const f of FIELDS) {
    const raw = (invoice as unknown as Record<string, unknown>)[f.key];
    let s = raw === null || raw === undefined ? "" : String(raw);
    if (f.key === "vat_number") s = formatVat(s) ?? ""; // normalise: no spaces
    v[f.key] = s;
  }
  return v;
}

export function InvoiceModal({
  invoice,
  projects = [],
}: {
  invoice: InvoiceWithSupplier;
  projects?: Project[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState(false);

  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() => initValues(invoice));
  const [projectId, setProjectId] = useState<string>(invoice.project_id ?? "");
  const [corrected, setCorrected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState<null | "approve" | "delete">(null);
  const [error, setError] = useState<string | null>(null);
  const [showMeta, setShowMeta] = useState(false);

  const close = useCallback(() => {
    setOpen(false);
    setEditing(false);
  }, []);

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

  function setField(key: string, value: string) {
    setValues((p) => ({ ...p, [key]: value }));
    setCorrected((p) => new Set(p).add(key));
  }

  function startEdit() {
    setValues(initValues(invoice));
    setProjectId(invoice.project_id ?? "");
    setCorrected(new Set());
    setError(null);
    setEditing(true);
  }

  const projectChanged = projectId !== (invoice.project_id ?? "");

  async function save() {
    setSaving(true);
    setError(null);
    const fields: Record<string, unknown> = {};
    for (const f of FIELDS) {
      const v = values[f.key];
      fields[f.key] = f.type === "number" ? (v === "" ? null : Number(v)) : v === "" ? null : v;
    }
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          fields,
          correctedFields: [...corrected],
          linkProjectId: projectId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  // accept (approve) the invoice as genuine, despite the duplicate flag
  async function accept() {
    setActing("approve");
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Approve failed");
      close();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setActing(null);
    }
  }

  // delete the invoice (permanent)
  async function remove() {
    if (
      !window.confirm(
        "Permanently delete this invoice and its file? This cannot be undone.",
      )
    )
      return;
    setActing("delete");
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Delete failed");
      close();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setActing(null);
    }
  }

  const isDuplicate = (invoice.duplicate_count ?? 0) > 0;

  const supplierName =
    invoice.supplier?.supplier_name || invoice.original_supplier_name || "Unknown supplier";

  // read-mode formatted value per field
  const display = useMemo(() => {
    const d: Record<string, React.ReactNode> = {};
    for (const f of FIELDS) {
      const v = values[f.key];
      d[f.key] = f.money
        ? formatMoney(v === "" ? null : Number(v), invoice.currency_code)
        : f.type === "date"
          ? formatDate(v || null)
          : v || "—";
    }
    return d;
  }, [values, invoice.currency_code]);

  // one row, read or edit, reused by the main list and the metadata section
  const renderRow = (f: Field) => (
    <div key={f.key} className="flex items-start justify-between gap-3 py-1.5">
      <dt className="text-muted shrink-0 pt-0.5">{f.label}</dt>
      <dd className="min-w-0 flex-1 text-right">
        {!editing ? (
          <span
            className={
              f.key === "total_incl_vat"
                ? "font-semibold tabular-nums"
                : "tabular-nums whitespace-pre-line"
            }
          >
            {display[f.key]}
          </span>
        ) : f.type === "select" ? (
          <select
            value={values[f.key]}
            onChange={(e) => setField(f.key, e.target.value)}
            className={inputCls(corrected.has(f.key)).replace("text-right", "text-left")}
          >
            <option value="">—</option>
            {f.options!.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : f.type === "textarea" ? (
          <textarea
            rows={3}
            value={values[f.key]}
            onChange={(e) => setField(f.key, e.target.value)}
            className={inputCls(corrected.has(f.key)) + " resize-none"}
          />
        ) : (
          <input
            type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
            step={f.type === "number" ? "0.01" : undefined}
            value={values[f.key]}
            onChange={(e) => setField(f.key, e.target.value)}
            className={inputCls(corrected.has(f.key))}
          />
        )}
      </dd>
    </div>
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group/view inline-flex items-center gap-0.5 rounded-md px-2 py-1 text-xs font-semibold text-[#1572a8] transition-colors hover:bg-brand-blue/10 hover:text-[#106191]"
      >
        View
        <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover/view:translate-x-0.5" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 text-left"
          onClick={close}
        >
          <div
            className="bg-surface rounded-xl border border-border w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden"
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
              <div className="flex items-center gap-2 shrink-0">
                {!editing && (
                  <button
                    onClick={startEdit}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                )}
                <button
                  onClick={close}
                  className="text-muted hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {error && (
              <div className="px-5 py-2 bg-red-50 text-status-low text-sm border-b border-red-100">
                {error}
              </div>
            )}

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
                    className="max-w-full rounded-lg ring-1 ring-black/5"
                  />
                )}
              </div>

              <div className="p-5 pr-7 space-y-4">
                {isDuplicate && (
                  <div
                    className="rounded-lg p-3"
                    style={{ backgroundColor: "#fff7ed", boxShadow: "inset 0 0 0 1px #ea580c33" }}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-status-duplicate mb-1">
                      <Copy className="h-3.5 w-3.5" /> Possible duplicate
                    </div>
                    <p className="text-xs text-foreground/80">
                      This looks like a duplicate of an existing invoice. Accept it if
                      it&apos;s genuinely separate, or delete it.
                    </p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <button
                        onClick={accept}
                        disabled={acting !== null}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-status-approved px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50 disabled:pointer-events-none"
                      >
                        {acting === "approve" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                        Accept
                      </button>
                      <button
                        onClick={remove}
                        disabled={acting !== null}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-status-low hover:bg-red-50 disabled:opacity-50 disabled:pointer-events-none"
                      >
                        {acting === "delete" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        Delete
                      </button>
                      <Link
                        href={`/review/${invoice.id}`}
                        onClick={close}
                        className="text-xs font-medium text-[#1572a8] hover:underline"
                      >
                        Compare in review →
                      </Link>
                    </div>
                  </div>
                )}
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

                {projects.length > 0 && (
                  <div className="flex items-center justify-between gap-3 border-b border-border pb-2 text-sm">
                    <span className="text-muted shrink-0">Site</span>
                    {editing ? (
                      <select
                        value={projectId}
                        onChange={(e) => setProjectId(e.target.value)}
                        className={inputCls(projectChanged).replace("text-right", "text-left")}
                      >
                        <option value="">No site</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span>{invoice.project?.name || "—"}</span>
                    )}
                  </div>
                )}

                <dl className="text-sm divide-y divide-border">
                  {MAIN_FIELDS.map(renderRow)}
                </dl>

                {/* Supplier details (Tel / Address) — collapsible metadata */}
                <div className="rounded-lg border border-border">
                  <button
                    onClick={() => setShowMeta((s) => !s)}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-muted hover:bg-slate-50"
                  >
                    <span className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5" /> Supplier details
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${showMeta ? "rotate-180" : ""}`}
                    />
                  </button>
                  {showMeta && (
                    <dl className="text-sm divide-y divide-border border-t border-border px-3">
                      {META_FIELDS.map(renderRow)}
                    </dl>
                  )}
                </div>

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
              {editing ? (
                <>
                  <button
                    onClick={() => setEditing(false)}
                    className="text-sm text-muted hover:text-foreground"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={save}
                    disabled={saving || (corrected.size === 0 && !projectChanged)}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary text-white px-3.5 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save changes
                  </button>
                </>
              ) : (
                <>
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
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3.5 py-2 text-sm font-medium hover:bg-slate-50"
                  >
                    Open full review <ExternalLink className="h-4 w-4" />
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function inputCls(isCorrected: boolean) {
  return [
    "w-full max-w-[12rem] inline-block rounded-lg border bg-surface px-2 py-1 text-sm text-right outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
    isCorrected ? "border-primary/60 bg-blue-50/40" : "border-border",
  ].join(" ");
}
