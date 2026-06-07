"use client";

import { useState, useMemo } from "react";
import { Download, CalendarRange } from "lucide-react";
import { Card } from "@/components/ui";
import { cn } from "@/lib/utils";

// Statuses worth exporting (the workflow ones; skip processing/duplicate noise).
const STATUS_OPTIONS = [
  { value: "approved", label: "Approved" },
  { value: "", label: "All statuses" },
  { value: "needs_review", label: "Needs review" },
  { value: "low_confidence", label: "Low confidence" },
  { value: "rejected", label: "Rejected" },
] as const;

function iso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

// SA tax year runs 1 March – end Feb. Returns [start, today] for "to date".
function taxYearToDate(now: Date): [string, string] {
  const y = now.getMonth() >= 2 ? now.getFullYear() : now.getFullYear() - 1;
  return [iso(new Date(y, 2, 1)), iso(now)];
}

export function ExportRangeForm() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState<string>("approved");
  const [kind, setKind] = useState<"invoices" | "vat_summary">("invoices");

  const presets = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    return [
      {
        label: "This month",
        from: iso(new Date(y, m, 1)),
        to: iso(new Date(y, m + 1, 0)),
      },
      {
        label: "Last month",
        from: iso(new Date(y, m - 1, 1)),
        to: iso(new Date(y, m, 0)),
      },
      { label: "Tax year to date", ...rangeObj(taxYearToDate(now)) },
    ];
  }, []);

  const href =
    `/api/export?status=${status}` +
    (kind === "vat_summary" ? "&type=vat_summary" : "") +
    (from ? `&from=${from}` : "") +
    (to ? `&to=${to}` : "");

  const statusLabel =
    STATUS_OPTIONS.find((s) => s.value === status)?.label ?? "Approved";

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-sm font-semibold mb-1">
        <CalendarRange className="h-4 w-4 text-primary" /> Custom range
      </div>
      <p className="text-xs text-muted mb-4">
        Export a date range for filing (VAT periods, tax year). Dates match the
        invoice date.
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        {presets.map((p) => {
          const active = from === p.from && to === p.to;
          return (
            <button
              key={p.label}
              onClick={() => {
                setFrom(p.from);
                setTo(p.to);
              }}
              className={cn(
                "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "border-primary bg-blue-50/60 text-primary"
                  : "border-border text-muted hover:bg-slate-50",
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="From">
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="To">
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Status">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={inputCls}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <span className="text-xs text-muted">Format</span>
        <div className="inline-flex rounded-lg border border-border p-0.5">
          {(
            [
              {
                v: "invoices",
                label: "Invoices (line by line)",
                tip: "One row per invoice — supplier, date, subtotal, VAT, total, payment method and confidence. Best for importing into bookkeeping software.",
              },
              {
                v: "vat_summary",
                label: "VAT summary (per month)",
                tip: "Rolled up to one row per month — subtotal, input VAT and total, plus a TOTAL row. The figures you file for VAT (SA VAT201).",
              },
            ] as const
          ).map((o) => (
            <div key={o.v} className="group relative">
              <button
                onClick={() => setKind(o.v)}
                title={o.tip}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  kind === o.v ? "bg-foreground text-white" : "text-muted hover:bg-slate-50",
                )}
              >
                {o.label}
              </button>
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-60 -translate-x-1/2 rounded-lg bg-foreground px-2.5 py-1.5 text-xs leading-snug text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                {o.tip}
                <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-foreground" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-xs text-muted">
          {kind === "vat_summary" ? "VAT summary · " : ""}
          {from || to
            ? `${statusLabel} · ${from || "start"} → ${to || "today"}`
            : `${statusLabel} · all dates`}
        </span>
        <a
          href={href}
          className="inline-flex items-center gap-2 rounded-lg bg-primary text-white px-3.5 py-2 text-sm font-medium hover:bg-blue-700"
        >
          <Download className="h-4 w-4" /> Export CSV
        </a>
      </div>
    </Card>
  );
}

const inputCls =
  "w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-muted">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function rangeObj([from, to]: [string, string]) {
  return { from, to };
}
