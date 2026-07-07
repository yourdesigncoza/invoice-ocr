import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth-guards";
import { normalizeName } from "@/lib/suppliers/matching";
import { STORAGE_BUCKET, type InvoiceStatus } from "@/lib/constants";
import {
  defaultAllocation,
  deriveFromItems,
  manualSplit,
  type AllocationEntry,
  type SplitPayload,
  type TaggableItem,
} from "@/lib/allocations/split";
import { replaceAllocations, syncAllocationsForInvoice } from "@/lib/allocations/sync";

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

  const { data: allocations } = await supabase
    .from("invoice_site_allocations")
    .select("*, project:projects(id, name, color)")
    .eq("invoice_id", id);

  return NextResponse.json({
    imageUrl,
    isPdf,
    items: items ?? [],
    allocations: allocations ?? [],
  });
}

interface PatchBody {
  // editable invoice fields (subset)
  fields?: Record<string, unknown>;
  // supplier resolution
  linkSupplierId?: string;
  createSupplier?: { name: string; vat_number?: string; address?: string };
  // site/project assignment ("" / null clears it)
  linkProjectId?: string | null;
  // multi-site split (per-site amounts land in invoice_site_allocations)
  split?: SplitPayload;
  // workflow action
  action?: "approve" | "reject" | "save";
  correctedFields?: string[]; // names the reviewer manually changed
}

const ACTION_STATUS: Record<string, InvoiceStatus> = {
  approve: "approved",
  reject: "rejected",
};

const EDITABLE_FIELDS = new Set([
  "original_supplier_name",
  "invoice_date",
  "due_date",
  "invoice_number",
  "document_type",
  "subtotal_excl_vat",
  "vat_amount",
  "total_incl_vat",
  "payment_method",
  "payment_status",
  "vat_number",
  "phone",
  "address",
  "po_number",
  "reference_number",
]);

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

  // Allowlist: reviewers edit extracted fields only — never identity/workflow
  // columns (project_id has its own ownership-checked path via linkProjectId;
  // status via action; user_id/approved_* are server-stamped).
  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body.fields ?? {})) {
    if (EDITABLE_FIELDS.has(k)) update[k] = v;
  }

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

  // site/project assignment
  if (body.linkProjectId !== undefined) {
    update.project_id = body.linkProjectId || null;
  }

  // workflow action → status
  if (body.action && ACTION_STATUS[body.action]) {
    update.status = ACTION_STATUS[body.action];
    if (body.action === "approve") {
      update.approved_at = new Date().toISOString();
      update.approved_by = user.id;
    }
  }

  // ── Preflight: validate EVERYTHING (site ownership + split derivation)
  // before any write, so a bad payload can't leave a half-applied invoice.
  // Ownership check = fetch through the RLS client: a foreign project id is
  // simply invisible.
  const referencedProjectIds = new Set<string>();
  if (body.linkProjectId) referencedProjectIds.add(body.linkProjectId);
  if (body.split?.mode === "items") {
    for (const pid of Object.values(body.split.itemProjects)) {
      if (pid) referencedProjectIds.add(pid);
    }
  } else if (body.split?.mode === "manual") {
    for (const ex of body.split.exceptions) referencedProjectIds.add(ex.project_id);
  }
  if (referencedProjectIds.size) {
    const ids = [...referencedProjectIds];
    const { data: owned } = await supabase.from("projects").select("id").in("id", ids);
    if ((owned ?? []).length !== ids.length)
      return NextResponse.json({ error: "Unknown site" }, { status: 400 });
  }

  // Derive the split in memory against the would-be post-update invoice state.
  const nextProjectId =
    body.linkProjectId !== undefined
      ? body.linkProjectId || null
      : (before.project_id as string | null);
  const nextTotal =
    update.total_incl_vat !== undefined
      ? update.total_incl_vat === null
        ? null
        : Number(update.total_incl_vat)
      : (before.total_incl_vat as number | null);

  let splitEntries: AllocationEntry[] | null = null;
  let taggedItems: TaggableItem[] | null = null;
  if (body.split) {
    const { data: items } = await supabase
      .from("invoice_items")
      .select("id, line_total, project_id")
      .eq("invoice_id", id);
    const byId = new Map((items ?? []).map((it) => [it.id as string, it]));

    if (body.split.mode === "items") {
      for (const itemId of Object.keys(body.split.itemProjects)) {
        if (!byId.has(itemId))
          return NextResponse.json({ error: "Unknown line item" }, { status: 400 });
      }
      taggedItems = (items ?? []).map((it) => ({
        id: it.id as string,
        line_total: it.line_total as number | null,
        project_id:
          body.split!.mode === "items" && it.id in body.split!.itemProjects
            ? body.split!.itemProjects[it.id as string]
            : (it.project_id as string | null),
      }));
      const derived = deriveFromItems(taggedItems, nextProjectId, nextTotal);
      if (!derived.ok)
        return NextResponse.json({ error: derived.error }, { status: 400 });
      splitEntries = derived.entries;
    } else if (body.split.mode === "manual") {
      const result = manualSplit(body.split.exceptions, nextProjectId, nextTotal);
      if (!result.ok)
        return NextResponse.json({ error: result.error }, { status: 400 });
      splitEntries = result.entries;
    } else {
      taggedItems = (items ?? []).map((it) => ({
        id: it.id as string,
        line_total: it.line_total as number | null,
        project_id: null,
      }));
      splitEntries = defaultAllocation(nextProjectId, nextTotal);
    }
  }

  // ── Mutations (preflight passed) ──────────────────────────────────────────
  const { data: after, error: updErr } = await supabase
    .from("invoices")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (updErr)
    return NextResponse.json({ error: updErr.message }, { status: 400 });

  try {
    if (body.split && splitEntries) {
      // persist item tags (items mode sets them; clear nulls them)
      if (taggedItems) {
        const byTarget = new Map<string | null, string[]>();
        for (const it of taggedItems) {
          const list = byTarget.get(it.project_id) ?? [];
          list.push(it.id);
          byTarget.set(it.project_id, list);
        }
        for (const [pid, itemIds] of byTarget) {
          const { error: tagErr } = await supabase
            .from("invoice_items")
            .update({ project_id: pid })
            .in("id", itemIds)
            .eq("invoice_id", id);
          if (tagErr) throw new Error(tagErr.message);
        }
      }
      await replaceAllocations(supabase, id, user.id, splitEntries);
    } else if (
      after.project_id !== before.project_id ||
      Number(after.total_incl_vat ?? 0) !== Number(before.total_incl_vat ?? 0)
    ) {
      // no explicit split in this request: keep allocations coherent
      await syncAllocationsForInvoice(
        supabase,
        {
          id,
          user_id: user.id,
          project_id: after.project_id,
          total_incl_vat: after.total_incl_vat,
        },
        { previousProjectId: before.project_id as string | null },
      );
    }
  } catch (allocErr) {
    const message = allocErr instanceof Error ? allocErr.message : String(allocErr);
    // the invoice update above already committed — audit what happened before
    // failing, so the trail never lies about a partial write (no transactions)
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: body.action ?? "save",
      entity_type: "invoice",
      entity_id: id,
      old_value: before,
      new_value: { ...after, site_split_error: message },
    });
    return NextResponse.json({ error: `Site split: ${message}` }, { status: 400 });
  }

  // audit log of the change (PRD §11.7 / §13.3) — one record, written last,
  // covering the invoice update AND the split that was actually applied
  await supabase.from("audit_logs").insert({
    user_id: user.id,
    action: body.action ?? "save",
    entity_type: "invoice",
    entity_id: id,
    old_value: before,
    new_value: splitEntries ? { ...after, site_split: splitEntries } : after,
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
