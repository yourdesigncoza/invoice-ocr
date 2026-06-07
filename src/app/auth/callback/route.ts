import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/utils";

export const runtime = "nodejs";

/**
 * Exchanges the PKCE `code` from Supabase email links (signup confirmation &
 * password recovery) for a session, then forwards to `next`. The session
 * cookies are written by createServerSupabase's setAll (route handlers can set
 * cookies). Recovery links point `next` at /reset-password.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createServerSupabase();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
