import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth-guards";

export const runtime = "nodejs";

/**
 * Rename or archive a site. "Remove site" = archive (archived=true): it leaves
 * the pickers but its invoices keep their project_id (data retained, PRD plan).
 * RLS scopes the update to the owner.
 */
export async function PATCH(
  req: NextRequest,
  ctx: RouteContext<"/api/projects/[id]">,
) {
  const user = await getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = await createServerSupabase();
  if (!supabase)
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { id } = await ctx.params;
  const { name, archived } = (await req.json()) as {
    name?: string;
    archived?: boolean;
  };

  const update: Record<string, unknown> = {};
  if (typeof name === "string" && name.trim()) update.name = name.trim();
  if (typeof archived === "boolean") update.archived = archived;
  if (Object.keys(update).length === 0)
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const { data, error } = await supabase
    .from("projects")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, project: data });
}
