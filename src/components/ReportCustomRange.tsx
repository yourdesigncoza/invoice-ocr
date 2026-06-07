"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui";

/** From/To picker that drills into the report detail view for an arbitrary window. */
export function ReportCustomRange() {
  const router = useRouter();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  function view() {
    if (!from || !to) return;
    const label = `${from} → ${to}`;
    router.push(
      `/reports/detail?group=custom&from=${from}&to=${to}&label=${encodeURIComponent(label)}`,
    );
  }

  const input =
    "rounded-lg border border-border bg-surface px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary";

  return (
    <Card className="p-5">
      <p className="text-sm font-semibold mb-1">Custom range</p>
      <p className="text-xs text-muted mb-4">
        Pick any window — e.g. a VAT period or tax year — and open the full
        report (KPIs, spend by supplier, invoices) with a scoped CSV export.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-xs text-muted">From</span>
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
            className={`mt-1 block ${input}`}
          />
        </label>
        <label className="block">
          <span className="text-xs text-muted">To</span>
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            className={`mt-1 block ${input}`}
          />
        </label>
        <button
          onClick={view}
          disabled={!from || !to}
          className="inline-flex items-center gap-2 rounded-lg bg-primary text-white px-3.5 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none"
        >
          View report <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </Card>
  );
}
