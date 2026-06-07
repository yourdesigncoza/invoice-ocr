import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { normalizeName } from "@/lib/suppliers/matching";
import type { InvoiceStatus } from "@/lib/constants";

export const runtime = "nodejs";

interface PatchBody {
  // editable invoice fields (subset)
  fields?: Record<string, unknown>;
  // supplier resolution
  linkSupplierId?: string;
  createSupplier?: { name: string; vat_number?: string; address?: string };
  // workflow action
  action?: "approve" | "reject" | "mark_duplicate" | "not_invoice" | "save";
  correctedFields?: string[]; // names the reviewer manually changed
}

const ACTION_STATUS: Record<string, InvoiceStatus> = {
  approve: "approved",
  reject: "rejected",
  mark_duplicate: "duplicate",
  not_invoice: "not_invoice",
};

export async function PATCH(
  req: NextRequest,
  ctx: RouteContext<"/api/invoices/[id]">,
) {
  const { id } = await ctx.params;
  const supabase = createAdminSupabase();
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
        field_name: name,
        normalized_value: String((body.fields ?? {})[name] ?? ""),
        source_type: "manual",
        was_manually_corrected: true,
      })),
    );
  }

  return NextResponse.json({ ok: true, invoice: after });
}
