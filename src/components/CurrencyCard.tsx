"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui";
import { CURRENCIES } from "@/lib/constants";

/**
 * Default currency picker. Currency is no longer edited per invoice — this one
 * choice stamps every new invoice the user uploads.
 */
export function CurrencyCard({ current }: { current: string }) {
  const [value, setValue] = useState(current);
  const [saved, setSaved] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ default_currency: value }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setSaved(value);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4 max-w-md">
      <label className="block text-xs font-medium text-muted">
        Default currency
      </label>
      <p className="mb-2 mt-1 text-xs text-muted">
        Applied to every new invoice. Existing invoices keep the currency they
        were recorded with.
      </p>
      <div className="flex items-center gap-2">
        <select
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setDone(false);
          }}
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        >
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={save}
          disabled={busy || value === saved}
          className="inline-flex items-center gap-2 rounded-lg bg-sidebar px-3.5 py-2 text-sm font-medium text-white hover:bg-[#1e293b] disabled:opacity-50 disabled:pointer-events-none"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Save
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-status-low">{error}</p>}
      {done && <p className="mt-2 text-sm text-status-approved">Currency saved.</p>}
    </Card>
  );
}
