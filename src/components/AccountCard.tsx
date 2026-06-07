"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui";
import { getBrowserSupabase } from "@/lib/supabase/client";

export function AccountCard({ email }: { email: string }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      setPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4 max-w-md">
      <div className="text-xs font-medium text-muted">Signed in as</div>
      <div className="mb-4 text-sm font-medium">{email}</div>

      <form onSubmit={changePassword} className="space-y-2">
        <label className="block text-xs font-medium text-muted">Change password</label>
        <div className="flex items-center gap-2">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password (min 8)"
            autoComplete="new-password"
            className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
          <button
            type="submit"
            disabled={busy || password.length < 8}
            className="inline-flex items-center gap-2 rounded-lg bg-sidebar px-3.5 py-2 text-sm font-medium text-white hover:bg-[#1e293b] disabled:opacity-50 disabled:pointer-events-none"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Update
          </button>
        </div>
        {error && <p className="text-sm text-status-low">{error}</p>}
        {done && <p className="text-sm text-status-approved">Password updated.</p>}
      </form>
    </Card>
  );
}
