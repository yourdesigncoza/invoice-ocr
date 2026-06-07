import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth-guards";
import { normalizeName } from "@/lib/suppliers/matching";
import { STORAGE_BUCKET, type InvoiceStatus } from "@/lib/constants";

export const runtime = "nodejs";

// Every handler runs as the signed-in user via the cookie-bound client, so RLS
// (user_id = auth.uid()) makes cross-tenant reads/writes/deletes impossible —
// an invoice that isn't yours simply isn't visible (404), no ownership checks
// to forget. Storage RLS isolates files by the <user_id>/ path prefix.

/**
 * Preview payload for the invoice modal: a signed URL for the original file
 * (private bucket) plus line items.
 */
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/invoices/[id]">,
) {
  if (!(await getUser()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const supabase = await createServerSupabase();
  if (!supabase)
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { data: invoice } = await supabase
    .from("invoices")
    .select("original_file_path")
    .eq("id", id)
    .single();

  let imageUrl: string | null = null;
  let isPdf = false;
  if (invoice?.original_file_path) {
    isPdf = invoice.original_file_path.toLowerCase().endsWith(".pdf");
    const { data } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(invoice.original_file_path, 60 * 60);
    imageUrl = data?.signedUrl ?? null;
  }

  const { data: items } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", id);

  return NextResponse.json({ imageUrl, isPdf, items: items ?? [] });
}

interface PatchBody {
  // editable invoice fields (subset)
  fields?: Record<string, unknown>;
  // supplier resolution
  linkSupplierId?: string;
  createSupplier?: { name: string; vat_number?: string; address?: string };
  // workflow action
  action?: "approve" | "reject" | "save";
  correctedFields?: string[]; // names the reviewer manually changed
}

const ACTION_STATUS: Record<string, InvoiceStatus> = {
  approve: "approved",
  reject: "rejected",
};

export async function PATCH(
  req: NextRequest,
  ctx: RouteContext<"/api/invoices/[id]">,
) {
  const user = await getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const supabase = await createServerSupabase();
  if (!supabase)
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const body = (await req.json()) as PatchBody;

  const { data: before } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .single();
  if (!before)
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const update: Record<string, unknown> = { ...(body.fields ?? {}) };

  // supplier silo resolution (PRD §7.5)
  if (body.createSupplier?.name) {
    const { data: sup, error } = await supabase
      .from("suppliers")
      .insert({
        supplier_name: body.createSupplier.name,
        normalized_name: normalizeName(body.createSupplier.name),
        vat_number: body.createSupplier.vat_number ?? null,
        address: body.createSupplier.address ?? null,
        user_id: user.id,
      })
      .select("id")
      .single();
    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });
    update.supplier_id = sup.id;
  } else if (body.linkSupplierId) {
    update.supplier_id = body.linkSupplierId;
  }

  // workflow action → status
  if (body.action && ACTION_STATUS[body.action]) {
    update.status = ACTION_STATUS[body.action];
    if (body.action === "approve") {
      update.approved_at = new Date().toISOString();
      update.approved_by = user.id;
    }
  }

  const { data: after, error: updErr } = await supabase
    .from("invoices")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (updErr)
    return NextResponse.json({ error: updErr.message }, { status: 400 });

  // audit log of the change (PRD §11.7 / §13.3)
  await supabase.from("audit_logs").insert({
    user_id: user.id,
    action: body.action ?? "save",
    entity_type: "invoice",
    entity_id: id,
    old_value: before,
    new_value: after,
  });

  // record which fields were manually corrected (PRD §11.5.1) — feeds the
  // "which fields are commonly wrong" quality signal.
  if (body.correctedFields?.length) {
    await supabase.from("extraction_fields").insert(
      body.correctedFields.map((name) => ({
        invoice_id: id,
        user_id: user.id,
        field_name: name,
        normalized_value: String((body.fields ?? {})[name] ?? ""),
        source_type: "manual",
        was_manually_corrected: true,
        corrected_by: user.id,
      })),
    );
  }

  return NextResponse.json({ ok: true, invoice: after });
}

/**
 * Hard delete: permanently removes the invoice row, its Storage file(s), and
 * (via ON DELETE CASCADE) its items / extraction_fields / duplicate_checks.
 * extraction_logs + document_uploads keep their rows with invoice_id nulled.
 * Unlike `reject` (a soft status change), this is irreversible — so we write
 * the audit_logs record *before* deleting, capturing the full prior state
 * (PRD §13.3). audit_logs.entity_id has no FK, so the trail survives the row.
 */
export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext<"/api/invoices/[id]">,
) {
  const user = await getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const supabase = await createServerSupabase();
  if (!supabase)
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { data: before } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .single();
  if (!before)
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  // audit first — irreversible action, record prior state before it's gone
  await supabase.from("audit_logs").insert({
    user_id: user.id,
    action: "delete",
    entity_type: "invoice",
    entity_id: id,
    old_value: before,
    new_value: null,
  });

  // remove stored file(s); original + processed may be the same or null
  const paths = [
    ...new Set(
      [before.original_file_path, before.processed_file_path].filter(
        (p): p is string => Boolean(p),
      ),
    ),
  ];
  if (paths.length) {
    await supabase.storage.from(STORAGE_BUCKET).remove(paths);
  }

  const { error: delErr } = await supabase.from("invoices").delete().eq("id", id);
  if (delErr)
    return NextResponse.json({ error: delErr.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
