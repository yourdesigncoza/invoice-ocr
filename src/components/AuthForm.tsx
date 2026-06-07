"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { safeNextPath } from "@/lib/utils";

export type AuthMode = "login" | "signup" | "forgot" | "reset";

const COPY: Record<AuthMode, { title: string; cta: string }> = {
  login: { title: "Sign in", cta: "Sign in" },
  signup: { title: "Create your account", cta: "Sign up" },
  forgot: { title: "Reset your password", cta: "Send reset link" },
  reset: { title: "Set a new password", cta: "Update password" },
};

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const needsEmail = mode !== "reset";
  const needsPassword = mode === "login" || mode === "signup" || mode === "reset";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setError("Auth is not configured.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push(next);
        router.refresh();
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
          },
        });
        if (error) throw error;
        setDone("Check your email to confirm your account, then sign in.");
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${location.origin}/auth/callback?next=/reset-password`,
        });
        if (error) throw error;
        setDone("If that email has an account, a reset link is on its way.");
      } else {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        router.push("/dashboard");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary";

  return (
    <div>
      <h1 className="text-lg font-semibold tracking-tight">{COPY[mode].title}</h1>

      {done ? (
        <p className="mt-4 rounded-lg bg-brand-green/10 px-3 py-2.5 text-sm text-foreground/80 ring-1 ring-inset ring-brand-green/30">
          {done}
        </p>
      ) : (
        <form onSubmit={submit} className="mt-5 space-y-3">
          {needsEmail && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Email</label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
              />
            </div>
          )}
          {needsPassword && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                {mode === "reset" ? "New password" : "Password"}
              </label>
              <input
                type="password"
                required
                minLength={8}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputCls}
              />
            </div>
          )}

          {error && <p className="text-sm text-status-low">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sidebar px-3.5 py-2 text-sm font-medium text-white transition-all hover:bg-[#1e293b] active:translate-y-px disabled:opacity-50 disabled:pointer-events-none"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {COPY[mode].cta}
          </button>
        </form>
      )}

      <div className="mt-5 flex items-center justify-between text-xs text-muted">
        {mode === "login" && (
          <>
            <Link href="/forgot-password" className="hover:text-foreground">
              Forgot password?
            </Link>
            <Link href="/signup" className="font-medium text-[#1572a8] hover:underline">
              Create account
            </Link>
          </>
        )}
        {(mode === "signup" || mode === "forgot") && (
          <Link href="/login" className="font-medium text-[#1572a8] hover:underline">
            ← Back to sign in
          </Link>
        )}
      </div>
    </div>
  );
}
