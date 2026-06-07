import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth-guards";

export const runtime = "nodejs";

/** Create a site/project for the current user. RLS + user_id keep it private. */
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = await createServerSupabase();
  if (!supabase)
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { name, color } = (await req.json()) as { name?: string; color?: string };
  if (!name?.trim())
    return NextResponse.json({ error: "Name required" }, { status: 400 });

  const { data, error } = await supabase
    .from("projects")
    .insert({ name: name.trim(), color: color ?? null, user_id: user.id })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, project: data });
}
