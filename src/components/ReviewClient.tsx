"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Check,
  X,
  Copy,
  Save,
  Loader2,
  AlertTriangle,
  ExternalLink,
  Trash2,
} from "lucide-react";
import { Card, Button } from "@/components/ui";
import { StatusBadge } from "@/components/StatusBadge";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { cn, formatMoney } from "@/lib/utils";
import {
  DOCUMENT_TYPES,
  PAYMENT_METHODS,
  type InvoiceStatus,
} from "@/lib/constants";
import type { Invoice, InvoiceItem, Supplier, Project } from "@/lib/types";

type Action = "approve" | "reject" | "save";

interface Props {
  invoice: Invoice & { supplier?: Supplier | null };
  items: InvoiceItem[];
  imageUrl: string | null;
  isPdf: boolean;
  supplierMatches: { supplier: Supplier; score: number; reason: string }[];
  allSuppliers: Supplier[];
  duplicates: { reason: string; score: number; invoice: Invoice }[];
  projects: Project[];
}

// editable text/number/date/select fields shown on the right pane (PRD §7.4)
const FIELDS = [
  { key: "original_supplier_name", label: "Supplier", type: "text" },
  { key: "invoice_date", label: "Invoice Date", type: "date" },
  { key: "due_date", label: "Due Date", type: "date" },
  { key: "invoice_number", label: "Invoice No", type: "text" },
  { key: "document_type", label: "Document Type", type: "select", options: DOCUMENT_TYPES },
  { key: "subtotal_excl_vat", label: "Subtotal (excl VAT)", type: "number" },
  { key: "vat_amount", label: "VAT", type: "number" },
  { key: "total_incl_vat", label: "Total (incl VAT)", type: "number" },
  { key: "payment_method", label: "Payment Method", type: "select", options: PAYMENT_METHODS },
  { key: "vat_number", label: "VAT Number", type: "text" },
] as const;

export function ReviewClient({
  invoice,
  items,
  imageUrl,
  isPdf,
  supplierMatches,
  allSuppliers,
  duplicates,
  projects,
}: Props) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const f of FIELDS) {
      const raw = (invoice as unknown as Record<string, unknown>)[f.key];
      v[f.key] = raw === null || raw === undefined ? "" : String(raw);
    }
    return v;
  });
  const [corrected, setCorrected] = useState<Set<string>>(new Set());
  const [supplierId, setSupplierId] = useState<string | null>(invoice.supplier_id);
  const [projectId, setProjectId] = useState<string>(invoice.project_id ?? "");
  // "Paid" flag → existing payment_status enum (Paid/Unpaid). Defaults checked:
  // most invoices double as receipts and are already settled; reviewer unchecks
  // for a terms invoice. A null/unknown status counts as paid by default.
  const initialPaid =
    invoice.payment_status == null ? true : invoice.payment_status === "Paid";
  const [paid, setPaid] = useState(initialPaid);
  const [busy, setBusy] = useState<Action | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    corrected.size > 0 ||
    supplierId !== invoice.supplier_id ||
    projectId !== (invoice.project_id ?? "") ||
    paid !== initialPaid;

  function setField(key: string, value: string) {
    setValues((p) => ({ ...p, [key]: value }));
    setCorrected((p) => new Set(p).add(key));
  }

  const payload = useMemo(() => {
    const fields: Record<string, unknown> = {};
    for (const f of FIELDS) {
      const v = values[f.key];
      if (f.type === "number") fields[f.key] = v === "" ? null : Number(v);
      else fields[f.key] = v === "" ? null : v;
    }
    fields.payment_status = paid ? "Paid" : "Unpaid";
    return fields;
  }, [values, paid]);

  async function run(action: Action, extra: Record<string, unknown> = {}) {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          fields: payload,
          correctedFields: [...corrected],
          linkSupplierId: supplierId ?? undefined,
          linkProjectId: projectId,
          ...extra,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Request failed");
      if (action === "save") {
        setCorrected(new Set());
        router.refresh();
      } else {
        router.push("/review");
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const locked = busy !== null || deleting;

  async function remove() {
    if (
      !window.confirm(
        "Permanently delete this invoice and its file? This cannot be undone.",
      )
    )
      return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Delete failed");
      router.push("/review");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDeleting(false);
    }
  }

  async function createSupplier() {
    const name = values.original_supplier_name?.trim();
    if (!name) return;
    await run("save", {
      createSupplier: { name, vat_number: values.vat_number || undefined },
    });
    router.refresh();
  }

  const linkedSupplier =
    allSuppliers.find((s) => s.id === supplierId) ?? invoice.supplier ?? null;

  return (
    <div className="h-[calc(100vh-4rem)] -mx-6 -my-8 flex flex-col">
      {/* header bar — stacks to two rows on mobile, single row on desktop */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-4 px-4 md:px-6 py-3 border-b border-border bg-surface">
        <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-wrap">
          <Link href="/review" className="text-sm text-muted hover:text-foreground shrink-0">
            ← Queue
          </Link>
          <StatusBadge status={invoice.status as InvoiceStatus} />
          <ConfidenceBadge score={invoice.confidence_score} />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => run("save")}
            disabled={busy !== null || !dirty}
            className="flex-1 md:flex-none justify-center"
          >
            {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </Button>
          <Button
            onClick={() => run("approve")}
            disabled={locked}
            className="flex-1 md:flex-none justify-center !bg-status-approved hover:!bg-green-700"
          >
            {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Approve
          </Button>
        </div>
      </div>

      {error && (
        <div className="px-6 py-2 bg-red-50 text-status-low text-sm border-b border-red-100">
          {error}
        </div>
      )}

      {/* Mobile: a plain block scroll region — image and fields stack in normal
          flow (no flex/grid track can shrink and let them overlap), so the
          image scrolls with the fields. lg+: the PRD §7.4 split-pane with
          independently-scrolling panes. */}
      <div className="flex-1 min-h-0 overflow-auto lg:grid lg:grid-cols-2 lg:overflow-hidden">
        {/* LEFT: original document (PRD §7.4) */}
        <div className="bg-slate-100 flex items-start justify-center lg:overflow-auto">
          {!imageUrl ? (
            <p className="text-sm text-muted mt-12">No file preview available.</p>
          ) : isPdf ? (
            <a
              href={imageUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary text-sm flex items-center gap-1 mt-12"
            >
              Open PDF <ExternalLink className="h-4 w-4" />
            </a>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt="Original invoice"
              className="max-w-full max-h-[50vh] lg:max-h-none rounded-lg ring-1 ring-black/5"
            />
          )}
        </div>

        {/* RIGHT: editable fields + supplier + duplicates + warnings */}
        <div className="p-6 space-y-6 lg:overflow-auto">
          {invoice.warnings?.length > 0 && (
            <Card className="p-3 border-amber-200 bg-amber-50/60">
              <div className="flex items-center gap-2 text-xs font-medium text-status-review mb-1.5">
                <AlertTriangle className="h-4 w-4" /> Warnings
              </div>
              <ul className="text-xs text-foreground/80 list-disc list-inside space-y-0.5">
                {invoice.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </Card>
          )}

          {duplicates.length > 0 && (
            <Card className="p-3 border-orange-200 bg-orange-50/60">
              <div className="flex items-center gap-2 text-xs font-medium text-status-duplicate mb-1.5">
                <Copy className="h-4 w-4" /> Possible duplicates
              </div>
              {duplicates.map((d, i) => (
                <div key={i} className="text-xs text-foreground/80">
                  <Link href={`/review/${d.invoice.id}`} className="text-primary hover:underline">
                    {d.invoice.original_supplier_name || "Invoice"} ·{" "}
                    {formatMoney(d.invoice.total_incl_vat, d.invoice.currency_code)}
                  </Link>{" "}
                  — {d.reason}
                </div>
              ))}
            </Card>
          )}

          {/* supplier silo resolution */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Supplier</h3>
            {linkedSupplier ? (
              <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2">
                <div>
                  <Link href={`/suppliers/${linkedSupplier.id}`} className="text-sm font-medium hover:text-primary">
                    {linkedSupplier.supplier_name}
                  </Link>
                  <div className="text-xs text-muted">Linked silo</div>
                </div>
                <button
                  onClick={() => setSupplierId(null)}
                  className="text-xs text-muted hover:text-status-low"
                >
                  Unlink
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {supplierMatches.map((m) => (
                  <button
                    key={m.supplier.id}
                    onClick={() => setSupplierId(m.supplier.id)}
                    className="w-full flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-left hover:border-primary"
                  >
                    <span className="text-sm">{m.supplier.supplier_name}</span>
                    <span className="text-xs text-status-approved font-medium">
                      {Math.round(m.score * 100)}% · {m.reason}
                    </span>
                  </button>
                ))}
                <div className="flex gap-2">
                  <select
                    className="flex-1 rounded-lg border border-border bg-surface px-2 py-2 text-sm"
                    value=""
                    onChange={(e) => e.target.value && setSupplierId(e.target.value)}
                  >
                    <option value="">Link existing supplier…</option>
                    {allSuppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.supplier_name}
                      </option>
                    ))}
                  </select>
                  <Button variant="ghost" onClick={createSupplier} disabled={locked}>
                    Create new
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* site / project assignment (only when the user runs ≥2 sites) */}
          {projects.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2">Site</h3>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-sm"
              >
                <option value="">No site</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* editable fields */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Extracted fields</h3>
            <div className="space-y-2">
              {FIELDS.map((f) => (
                <div key={f.key} className="grid grid-cols-3 items-center gap-3">
                  <label className="text-sm text-muted col-span-1">{f.label}</label>
                  <div className="col-span-2">
                    {f.type === "select" ? (
                      <select
                        value={values[f.key]}
                        onChange={(e) => setField(f.key, e.target.value)}
                        className={fieldCls(corrected.has(f.key))}
                      >
                        <option value="">—</option>
                        {f.options!.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                        step={f.type === "number" ? "0.01" : undefined}
                        value={values[f.key]}
                        onChange={(e) => setField(f.key, e.target.value)}
                        className={fieldCls(corrected.has(f.key))}
                      />
                    )}
                  </div>
                </div>
              ))}

              {/* Paid flag → payment_status; most invoices are settled receipts */}
              <div className="grid grid-cols-3 items-center gap-3">
                <label htmlFor="paid-toggle" className="text-sm text-muted col-span-1">
                  Paid
                </label>
                <div className="col-span-2">
                  <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      id="paid-toggle"
                      type="checkbox"
                      checked={paid}
                      onChange={(e) => setPaid(e.target.checked)}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-primary/30"
                    />
                    <span className={paid ? "font-medium text-status-approved" : "text-muted"}>
                      {paid ? "Paid" : "Unpaid"}
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {items.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2">Line items</h3>
              <Card className="overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-muted text-left">
                    <tr>
                      <th className="px-3 py-1.5 font-medium">Description</th>
                      <th className="px-3 py-1.5 font-medium text-right">Qty</th>
                      <th className="px-3 py-1.5 font-medium text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {items.map((it) => (
                      <tr key={it.id}>
                        <td className="px-3 py-1.5">{it.description || "—"}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{it.quantity ?? "—"}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {formatMoney(it.line_total, invoice.currency_code)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>
          )}

          {/* secondary actions */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
            <Button
              variant="ghost"
              onClick={() => run("reject")}
              disabled={locked}
              className="!text-status-low"
            >
              <X className="h-4 w-4" /> Reject
            </Button>
            <Button
              variant="ghost"
              onClick={remove}
              disabled={locked}
              className="!text-status-low ml-auto"
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Delete
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function fieldCls(isCorrected: boolean) {
  return cn(
    "w-full rounded-lg border bg-surface px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
    isCorrected ? "border-primary/60 bg-blue-50/40" : "border-border",
  );
}
