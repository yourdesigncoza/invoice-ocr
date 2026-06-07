import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getUser, isAdminEmail } from "@/lib/auth-guards";
import { STORAGE_BUCKET } from "@/lib/constants";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/** Recursively collect every object path under a prefix. */
async function listAll(supabase: SupabaseClient, prefix: string): Promise<string[]> {
  const { data } = await supabase.storage.from(STORAGE_BUCKET).list(prefix, { limit: 1000 });
  let files: string[] = [];
  for (const e of data ?? []) {
    const path = `${prefix}/${e.name}`;
    if (e.id === null) files = files.concat(await listAll(supabase, path));
    else files.push(path);
  }
  return files;
}

/**
 * Admin: permanently delete a user account. Their app data cascades via the
 * user_id ON DELETE CASCADE FKs (0006); their Storage files (under <userId>/)
 * have no FK, so we remove them explicitly. Refuses self-deletion. Gated to
 * ADMIN_EMAILS (404 for others).
 */
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user || !isAdminEmail(user.email))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const supabase = createAdminSupabase();
  if (!supabase)
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { userId } = (await req.json()) as { userId?: string };
  if (!userId)
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  if (userId === user.id)
    return NextResponse.json(
      { error: "You can't delete your own admin account" },
      { status: 409 },
    );

  // remove the user's storage objects first (no FK cascade for Storage)
  try {
    const files = await listAll(supabase, userId);
    if (files.length) await supabase.storage.from(STORAGE_BUCKET).remove(files);
  } catch {
    // best-effort — proceed with account deletion regardless
  }

  // deletes auth.users row → cascades all app rows via user_id FKs
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
