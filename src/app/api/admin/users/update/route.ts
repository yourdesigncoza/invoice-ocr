import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getUser, isAdminEmail } from "@/lib/auth-guards";

export const runtime = "nodejs";

/**
 * Admin: update a user's account (reset password / change email). Gated to
 * ADMIN_EMAILS — non-admins get 404 so the endpoint's existence isn't leaked.
 * Uses the service-role admin API; it touches accounts only, never invoice data.
 */
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user || !isAdminEmail(user.email))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const supabase = createAdminSupabase();
  if (!supabase)
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { userId, password, email } = (await req.json()) as {
    userId?: string;
    password?: string;
    email?: string;
  };
  if (!userId)
    return NextResponse.json({ error: "userId required" }, { status: 400 });

  const attrs: { password?: string; email?: string; email_confirm?: boolean } = {};
  if (password) {
    if (password.length < 8)
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 },
      );
    attrs.password = password;
  }
  if (email) {
    attrs.email = email;
    attrs.email_confirm = true; // keep them able to sign in without re-verifying
  }
  if (!attrs.password && !attrs.email)
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const { error } = await supabase.auth.admin.updateUserById(userId, attrs);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
