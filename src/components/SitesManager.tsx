"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Pencil, Archive, Loader2, Check, X } from "lucide-react";
import { Card } from "@/components/ui";
import { formatMoney } from "@/lib/utils";
import type { Project } from "@/lib/types";

type SiteRow = Project & { invoice_count: number; total_spend: number };

export function SitesManager({ projects }: { projects: SiteRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  async function call(url: string, method: string, body: object) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Request failed");
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!name.trim()) return;
    if (await call("/api/projects", "POST", { name })) setName("");
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="New site name (e.g. Hartenbos outlet)"
          className="flex-1 max-w-xs rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
        <button
          onClick={add}
          disabled={busy || !name.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-sidebar px-3 py-2 text-sm font-medium text-white hover:bg-[#1e293b] disabled:opacity-50 disabled:pointer-events-none"
        >
          <Plus className="h-4 w-4" /> Add site
        </button>
      </div>
      {error && <p className="mb-2 text-sm text-status-low">{error}</p>}

      {projects.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted">
          No sites yet. Add one above. Once you have <b>2 or more</b>, you can tag
          invoices by site at upload and filter reports per site.
        </Card>
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {projects.map((p) => (
            <div key={p.id} className="flex items-center gap-3 p-3.5">
              <div className="min-w-0 flex-1">
                {editId === p.id ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      autoFocus
                      className="rounded-md border border-border bg-surface px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <button
                      onClick={async () => {
                        if (await call(`/api/projects/${p.id}`, "PATCH", { name: editName }))
                          setEditId(null);
                      }}
                      className="text-status-approved hover:opacity-70"
                      aria-label="Save"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setEditId(null)}
                      className="text-muted hover:text-foreground"
                      aria-label="Cancel"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <Link
                    href={`/invoices?view=all&project=${p.id}`}
                    className="text-sm font-medium hover:text-primary"
                  >
                    {p.name}
                  </Link>
                )}
                <div className="text-xs text-muted mt-0.5">
                  {p.invoice_count} approved · {formatMoney(p.total_spend)}
                </div>
              </div>
              {editId !== p.id && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => {
                      setEditId(p.id);
                      setEditName(p.name);
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-slate-50"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Rename
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`Archive "${p.name}"? Its invoices keep their history; it just leaves the pickers.`))
                        call(`/api/projects/${p.id}`, "PATCH", { archived: true });
                    }}
                    disabled={busy}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Archive className="h-3.5 w-3.5" /> Archive
                  </button>
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
