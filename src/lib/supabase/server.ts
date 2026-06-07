import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** True when the server has enough config to talk to Supabase. */
export function isSupabaseConfigured(): boolean {
  return Boolean(url && (serviceKey || anonKey));
}

/**
 * Cookie-bound client for the current request — respects RLS / the signed-in
 * user. Use in Server Components & route handlers that act *as the user*.
 * Next.js 16: `cookies()` is async.
 */
export async function createServerSupabase(): Promise<SupabaseClient | null> {
  if (!url || !anonKey) return null;
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // called from a Server Component — safe to ignore (middleware refreshes)
        }
      },
    },
  });
}

/**
 * Service-role client — bypasses RLS. Server-only. Used by the extraction
 * pipeline and trusted writes (approvals, supplier silos). Never import in a
 * Client Component.
 */
export function createAdminSupabase(): SupabaseClient | null {
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
