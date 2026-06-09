"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Trash2, Loader2, X } from "lucide-react";
import { Card } from "@/components/ui";
import { formatDate, formatBytes } from "@/lib/utils";

/** Shape returned by the admin_user_stats() RPC (aggregate metadata only). */
export interface AdminUserStats {
  user_id: string;
  invoice_count: number;
  extraction_count: number;
  storage_bytes: number;
  last_activity: string | null;
}

export interface AdminUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  confirmed: boolean;
  invoiceCount: number;
  extractionCount: number;
  storageBytes: number;
  lastActivity: string | null;
}

const PAGE_SIZE = 20;

export function AdminUsersClient({
  users,
  currentUserId,
}: {
  users: AdminUser[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [reset, setReset] = useState<AdminUser | null>(null);
  const [del, setDel] = useState<AdminUser | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const pages = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
  const slice = users.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  async function submitReset() {
    if (!reset) return;
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: reset.id, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Update failed");
      setNotice(`Password updated for ${reset.email}.`);
      setReset(null);
      setPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function submitDelete() {
    if (!del) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: del.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Delete failed");
      setNotice(`Deleted ${del.email} and all their data.`);
      setDel(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {notice && (
        <div className="mb-3 rounded-lg bg-brand-green/10 px-3 py-2 text-sm text-foreground/80 ring-1 ring-inset ring-brand-green/30">
          {notice}
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-slate-50/60 text-left">
              <tr className="[&>th]:px-3.5 [&>th]:py-2 [&>th]:text-[11px] [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-[0.05em] [&>th]:text-muted">
                <th>Email</th>
                <th>Registered</th>
                <th>Last sign-in</th>
                <th title="Most recent upload or invoice — distinct from last sign-in">
                  Last activity
                </th>
                <th title="Invoices owned by this user">Invoices</th>
                <th title="OpenAI extraction runs — usage / cost signal">
                  Extractions
                </th>
                <th title="Total size of uploaded files">Storage</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {slice.map((u) => (
                <tr key={u.id} className="transition-colors hover:bg-brand-blue/[0.04]">
                  <td className="px-3.5 py-2 font-medium">
                    {u.email}
                    {u.id === currentUserId && (
                      <span className="ml-2 rounded bg-brand-blue/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#1572a8]">
                        you
                      </span>
                    )}
                    {!u.confirmed && (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-status-review">
                        unconfirmed
                      </span>
                    )}
                  </td>
                  <td className="px-3.5 py-2 text-muted whitespace-nowrap">
                    {formatDate(u.created_at)}
                  </td>
                  <td className="px-3.5 py-2 text-muted whitespace-nowrap">
                    {u.last_sign_in_at ? formatDate(u.last_sign_in_at) : "—"}
                  </td>
                  <td className="px-3.5 py-2 text-muted whitespace-nowrap">
                    {u.lastActivity ? formatDate(u.lastActivity) : "—"}
                  </td>
                  <td className="px-3.5 py-2 tabular-nums text-foreground/80">
                    {u.invoiceCount}
                  </td>
                  <td className="px-3.5 py-2 tabular-nums text-foreground/80">
                    {u.extractionCount}
                  </td>
                  <td className="px-3.5 py-2 tabular-nums text-muted whitespace-nowrap">
                    {formatBytes(u.storageBytes)}
                  </td>
                  <td className="px-3.5 py-2">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => {
                          setReset(u);
                          setPassword("");
                          setError(null);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-slate-50"
                      >
                        <KeyRound className="h-3.5 w-3.5" /> Reset password
                      </button>
                      <button
                        onClick={() => {
                          setDel(u);
                          setError(null);
                        }}
                        disabled={u.id === currentUserId}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs font-medium text-status-low hover:bg-red-50 disabled:opacity-40 disabled:pointer-events-none"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-3.5 py-2 text-xs text-muted">
            <span>
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, users.length)} of{" "}
              {users.length}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded-md border border-border px-2 py-1 font-medium hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none"
              >
                Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
                disabled={page >= pages - 1}
                className="rounded-md border border-border px-2 py-1 font-medium hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* reset-password modal */}
      {reset && (
        <Modal title={`Reset password — ${reset.email}`} onClose={() => setReset(null)}>
          <input
            type="text"
            autoFocus
            placeholder="New password (min 8 chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
          {error && <p className="mt-2 text-sm text-status-low">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setReset(null)} className="rounded-lg px-3 py-2 text-sm text-muted hover:text-foreground">
              Cancel
            </button>
            <button
              onClick={submitReset}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-sidebar px-3.5 py-2 text-sm font-medium text-white hover:bg-[#1e293b] disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Set password
            </button>
          </div>
        </Modal>
      )}

      {/* delete confirm modal */}
      {del && (
        <Modal title="Delete user" onClose={() => setDel(null)}>
          <p className="text-sm text-foreground/80">
            Permanently delete <span className="font-semibold">{del.email}</span> and{" "}
            <span className="font-semibold">all their invoices, suppliers, sites and files</span>?
            This cannot be undone.
          </p>
          {error && <p className="mt-2 text-sm text-status-low">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setDel(null)} className="rounded-lg px-3 py-2 text-sm text-muted hover:text-foreground">
              Cancel
            </button>
            <button
              onClick={submitDelete}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-status-low px-3.5 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete user
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-muted hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
