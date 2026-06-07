import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lightweight polling endpoint for the upload notification provider.
 *
 *  - `?ids=a,b,c` → status of those specific uploads (used while watching jobs).
 *  - no params    → uploads still 'processing' (used on page load to re-discover
 *                   in-flight work after a reload / app reopen).
 *
 * The `document_uploads` table is the source of truth, so progress survives the
 * client closing the app mid-extraction.
 */
export async function GET(req: NextRequest) {
  const supabase = createAdminSupabase();
  if (!supabase)
    return NextResponse.json({ uploads: [] });

  const idsParam = req.nextUrl.searchParams.get("ids");

  let query = supabase
    .from("document_uploads")
    .select("id, file_name, upload_status, invoice_id");

  if (idsParam) {
    const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) return NextResponse.json({ uploads: [] });
    query = query.in("id", ids);
  } else {
    query = query
      .eq("upload_status", "processing")
      .order("created_at", { ascending: false })
      .limit(20);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ uploads: [], error: error.message });

  const rows = data ?? [];

  // flag uploads whose resulting invoice has system-detected duplicate(s), so
  // the upload notification can highlight them for review
  const invoiceIds = rows
    .map((r) => r.invoice_id)
    .filter((id): id is string => Boolean(id));
  let dupeIds = new Set<string>();
  if (invoiceIds.length) {
    const { data: checks } = await supabase
      .from("duplicate_checks")
      .select("invoice_id")
      .in("invoice_id", invoiceIds);
    dupeIds = new Set((checks ?? []).map((c) => c.invoice_id));
  }

  const uploads = rows.map((r) => ({
    ...r,
    duplicate: r.invoice_id ? dupeIds.has(r.invoice_id) : false,
  }));
  return NextResponse.json({ uploads });
}
