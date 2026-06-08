import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth-guards";
import { CURRENCY_CODES } from "@/lib/constants";

export const runtime = "nodejs";

/**
 * Upsert the current user's preferences. RLS + the user_id primary key keep
 * each row private; cookie-bound client scopes the write to the caller.
 */
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = await createServerSupabase();
  if (!supabase)
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { default_currency } = (await req.json()) as { default_currency?: string };
  if (!default_currency || !CURRENCY_CODES.includes(default_currency))
    return NextResponse.json({ error: "Unsupported currency" }, { status: 400 });

  const { data, error } = await supabase
    .from("user_settings")
    .upsert(
      {
        user_id: user.id,
        default_currency,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, settings: data });
}
