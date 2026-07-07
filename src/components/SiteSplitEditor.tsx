"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui";
import { formatMoney } from "@/lib/utils";
import {
  deriveFromItems,
  manualSplit,
  round2,
  type AllocationEntry,
  type SplitPayload,
} from "@/lib/allocations/split";
import type { InvoiceItem, InvoiceSiteAllocation, Project } from "@/lib/types";

// Line-items table + multi-site split editor (default-plus-exceptions).
// The live per-site preview runs the SAME pure functions the server persists
// with (lib/allocations/split.ts), so what the reviewer sees is what lands in
// invoice_site_allocations. Site controls only render with ≥2 active sites —
// below that this is exactly the old read-only items table.

interface Props {
  items: InvoiceItem[];
  projects: Project[];
  /** the invoice's current default site (review's picker state); "" = none */
  defaultProjectId: string | null;
  totalInclVat: number | null;
  currency: string;
  allocations: InvoiceSiteAllocation[];
  onChange: (split: SplitPayload | null) => void;
  disabled?: boolean;
}

export function SiteSplitEditor({
  items,
  projects,
  defaultProjectId,
  totalInclVat,
  currency,
  allocations,
  onChange,
  disabled = false,
}: Props) {
  const splittable = projects.length >= 2;
  const persistedManual = allocations.some((a) => a.source === "manual");

  // Local tag state: null = default site. Seeded from persisted item tags.
  const [itemProjects, setItemProjects] = useState<Record<string, string | null>>(
    () => Object.fromEntries(items.map((it) => [it.id, it.project_id])),
  );
  const [manualOpen, setManualOpen] = useState(persistedManual);
  const [manualRows, setManualRows] = useState<{ project_id: string; amount: string }[]>(
    () =>
      allocations
        .filter((a) => a.source === "manual" && a.project_id !== defaultProjectId)
        .map((a) => ({ project_id: a.project_id, amount: String(a.amount) })),
  );

  const defaultSite = projects.find((p) => p.id === defaultProjectId) ?? null;

  function tagItem(itemId: string, projectId: string | null) {
    const next = { ...itemProjects, [itemId]: projectId };
    setItemProjects(next);
    setManualOpen(false);
    const anyTag = Object.values(next).some(
      (pid) => pid && pid !== defaultProjectId,
    );
    onChange(anyTag ? { mode: "items", itemProjects: next } : { mode: "clear" });
  }

  function updateManual(rows: { project_id: string; amount: string }[]) {
    setManualRows(rows);
    const exceptions = rows
      .filter((r) => r.project_id && r.amount !== "")
      .map((r) => ({ project_id: r.project_id, amount: Number(r.amount) }));
    onChange(exceptions.length ? { mode: "manual", exceptions } : { mode: "clear" });
  }

  // Live preview via the same math the server runs.
  const preview = useMemo((): { entries: AllocationEntry[] | null; error: string | null } => {
    if (!splittable) return { entries: null, error: null };
    if (manualOpen) {
      const exceptions = manualRows
        .filter((r) => r.project_id && r.amount !== "")
        .map((r) => ({ project_id: r.project_id, amount: Number(r.amount) }));
      if (!exceptions.length) return { entries: null, error: null };
      const r = manualSplit(exceptions, defaultProjectId, totalInclVat);
      return r.ok ? { entries: r.entries, error: null } : { entries: null, error: r.error };
    }
    const tagged = items.map((it) => ({
      id: it.id,
      line_total: it.line_total,
      project_id: itemProjects[it.id] ?? null,
    }));
    if (!tagged.some((t) => t.project_id && t.project_id !== defaultProjectId))
      return { entries: null, error: null };
    const r = deriveFromItems(tagged, defaultProjectId, totalInclVat);
    return r.ok ? { entries: r.entries, error: null } : { entries: null, error: r.error };
  }, [splittable, manualOpen, manualRows, items, itemProjects, defaultProjectId, totalInclVat]);

  const taggedSum = useMemo(
    () =>
      round2(
        items.reduce(
          (s, it) =>
            itemProjects[it.id] && itemProjects[it.id] !== defaultProjectId
              ? s + Number(it.line_total ?? 0)
              : s,
          0,
        ),
      ),
    [items, itemProjects, defaultProjectId],
  );
  const itemsSum = round2(items.reduce((s, it) => s + Number(it.line_total ?? 0), 0));

  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? "—";

  return (
    <div className="space-y-3">
      {items.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Line items</h3>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-muted text-left">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Description</th>
                    <th className="px-3 py-1.5 font-medium text-right">Qty</th>
                    <th className="px-3 py-1.5 font-medium text-right">Total</th>
                    {splittable && <th className="px-3 py-1.5 font-medium">Site</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((it) => (
                    <tr key={it.id}>
                      <td className="px-3 py-1.5">{it.description || "—"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{it.quantity ?? "—"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">
                        {formatMoney(it.line_total, currency)}
                      </td>
                      {splittable && (
                        <td className="px-3 py-1">
                          <select
                            value={itemProjects[it.id] ?? ""}
                            onChange={(e) => tagItem(it.id, e.target.value || null)}
                            disabled={disabled}
                            aria-label="Site for this line"
                            className="w-full min-w-24 rounded border border-border bg-surface px-1.5 py-1 text-xs"
                          >
                            <option value="">
                              {defaultSite ? `${defaultSite.name} (default)` : "Default site"}
                            </option>
                            {projects
                              .filter((p) => p.id !== defaultProjectId)
                              .map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                          </select>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {splittable && (
        <div className="space-y-2">
          {/* items-mode transparency line */}
          {!manualOpen && taggedSum !== 0 && (
            <p className="text-xs text-muted">
              Tagged lines: {formatMoney(taggedSum, currency)} of{" "}
              {formatMoney(itemsSum, currency)} — shares applied to the invoice
              total of {formatMoney(totalInclVat, currency)}.
            </p>
          )}

          {preview.error && (
            <p className="text-xs text-status-low">{preview.error}</p>
          )}

          {/* manual fallback: no items, or item-derivation refused */}
          {(items.length === 0 || preview.error || manualOpen) && (
            <div>
              {!manualOpen ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setManualOpen(true)}
                  className="text-xs text-primary hover:underline"
                >
                  Split across sites by amount…
                </button>
              ) : (
                <Card className="p-3 space-y-2">
                  <div className="text-xs font-medium">Manual split</div>
                  {manualRows.map((row, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <select
                        value={row.project_id}
                        disabled={disabled}
                        onChange={(e) =>
                          updateManual(
                            manualRows.map((r, i) =>
                              i === idx ? { ...r, project_id: e.target.value } : r,
                            ),
                          )
                        }
                        className="flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-xs"
                      >
                        <option value="">Choose site…</option>
                        {projects
                          .filter((p) => p.id !== defaultProjectId)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </select>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Amount"
                        value={row.amount}
                        disabled={disabled}
                        onChange={(e) =>
                          updateManual(
                            manualRows.map((r, i) =>
                              i === idx ? { ...r, amount: e.target.value } : r,
                            ),
                          )
                        }
                        className="w-28 rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-right tabular-nums"
                      />
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => updateManual(manualRows.filter((_, i) => i !== idx))}
                        className="text-xs text-muted hover:text-status-low"
                        aria-label="Remove split line"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => setManualRows([...manualRows, { project_id: "", amount: "" }])}
                      className="text-xs text-primary hover:underline"
                    >
                      + Add site
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        setManualOpen(false);
                        updateManual([]);
                      }}
                      className="text-xs text-muted hover:text-foreground"
                    >
                      Remove split
                    </button>
                  </div>
                  {defaultSite && (
                    <p className="text-xs text-muted">
                      {defaultSite.name} (default) takes the remainder automatically.
                    </p>
                  )}
                </Card>
              )}
            </div>
          )}

          {/* live per-site preview — the exact amounts that will be saved */}
          {preview.entries && preview.entries.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {preview.entries.map((e) => (
                <span
                  key={e.project_id}
                  className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs tabular-nums"
                >
                  <span className="font-medium">{projectName(e.project_id)}</span>
                  {formatMoney(e.amount, currency)}
                  {totalInclVat ? (
                    <span className="text-muted">
                      ({Math.round((e.amount / Number(totalInclVat)) * 100)}%)
                    </span>
                  ) : null}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
