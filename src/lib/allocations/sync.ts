import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  defaultAllocation,
  deriveFromItems,
  round2,
  type AllocationEntry,
} from "./split";

// Keeps invoice_site_allocations coherent with the invoice on every write
// path (extract pipeline + invoices PATCH). Re-derive, don't rescale: an
// items-sourced split recomputes from the persisted invoice_items.project_id
// tags, so total corrections and default-site changes both fall out correctly
// with no accumulated rounding drift. Only manual splits (no item basis)
// rescale proportionally.

interface InvoiceForSync {
  id: string;
  user_id: string;
  project_id: string | null;
  total_incl_vat: number | null;
}

/**
 * Non-destructive replacement: upsert the new rows first, then delete strays.
 * Never delete-then-insert — supabase-js has no transactions, and a crash
 * between the two must leave stale-extra rows (visible, repairable by the next
 * sync) rather than zero rows (invoice silently vanishing from per-site reads).
 * Requires userId: the extract path writes with the service-role client, which
 * bypasses RLS (the 0011 tenant trigger is the DB-level backstop).
 */
export async function replaceAllocations(
  supabase: SupabaseClient,
  invoiceId: string,
  userId: string,
  entries: AllocationEntry[],
): Promise<void> {
  if (!userId) throw new Error("replaceAllocations: userId is required");

  if (entries.length) {
    const { error } = await supabase.from("invoice_site_allocations").upsert(
      entries.map((e) => ({
        invoice_id: invoiceId,
        user_id: userId,
        project_id: e.project_id,
        amount: e.amount,
        source: e.source,
      })),
      { onConflict: "invoice_id,project_id" },
    );
    if (error) throw new Error(`allocations upsert: ${error.message}`);
  }

  let del = supabase
    .from("invoice_site_allocations")
    .delete()
    .eq("invoice_id", invoiceId);
  if (entries.length) {
    del = del.not(
      "project_id",
      "in",
      `("${entries.map((e) => e.project_id).join('","')}")`,
    );
  }
  const { error: delErr } = await del;
  if (delErr) throw new Error(`allocations cleanup: ${delErr.message}`);
}

/**
 * Re-establish the allocation invariant after the invoice's `project_id` or
 * `total_incl_vat` changed. `previousProjectId` (when the caller knows it —
 * the PATCH route's `before` row) lets a manual split's remainder row follow
 * a default-site change.
 */
export async function syncAllocationsForInvoice(
  supabase: SupabaseClient,
  invoice: InvoiceForSync,
  opts: { previousProjectId?: string | null } = {},
): Promise<void> {
  const { data: rows, error } = await supabase
    .from("invoice_site_allocations")
    .select("project_id, amount, source")
    .eq("invoice_id", invoice.id);
  if (error) throw new Error(`allocations read: ${error.message}`);

  const existing = rows ?? [];
  const isSplit = existing.some((r) => r.source === "items" || r.source === "manual");

  // Unsplit (or brand new): mirror the invoice's default site.
  if (!isSplit) {
    await replaceAllocations(
      supabase,
      invoice.id,
      invoice.user_id,
      defaultAllocation(invoice.project_id, invoice.total_incl_vat),
    );
    return;
  }

  if (existing.some((r) => r.source === "items")) {
    // Recompute from the stored tags (null tag = current default site).
    const { data: items, error: itemsErr } = await supabase
      .from("invoice_items")
      .select("id, line_total, project_id")
      .eq("invoice_id", invoice.id);
    if (itemsErr) throw new Error(`items read: ${itemsErr.message}`);
    const derived = deriveFromItems(items ?? [], invoice.project_id, invoice.total_incl_vat);
    if (!derived.ok) {
      // Weights became unusable (e.g. an item edit) — keep the existing rows
      // rather than writing a bad split; the next explicit split-save fixes it.
      console.warn(`syncAllocations(${invoice.id}): ${derived.error} — rows left as-is`);
      return;
    }
    await replaceAllocations(supabase, invoice.id, invoice.user_id, derived.entries);
    return;
  }

  // Manual split: no item basis — follow a default-site change, then rescale
  // proportionally to the (possibly new) total.
  let entries: AllocationEntry[] = existing.map((r) => ({
    project_id: r.project_id as string,
    amount: Number(r.amount),
    source: "manual" as const,
  }));

  const prev = opts.previousProjectId;
  if (prev !== undefined && prev !== invoice.project_id && invoice.project_id) {
    const fromRow = entries.find((e) => e.project_id === prev);
    if (fromRow) {
      const toRow = entries.find((e) => e.project_id === invoice.project_id);
      if (toRow) {
        toRow.amount = round2(toRow.amount + fromRow.amount);
        entries = entries.filter((e) => e !== fromRow);
      } else {
        fromRow.project_id = invoice.project_id;
      }
    }
  }

  const oldSum = round2(entries.reduce((s, e) => s + e.amount, 0));
  const total = round2(Number(invoice.total_incl_vat ?? 0));
  if (oldSum !== total) {
    if (oldSum === 0) {
      // Nothing to scale from — fall back to a single default row.
      await replaceAllocations(
        supabase,
        invoice.id,
        invoice.user_id,
        defaultAllocation(invoice.project_id, invoice.total_incl_vat),
      );
      return;
    }
    const remainderRow =
      entries.find((e) => e.project_id === invoice.project_id) ??
      entries.reduce((a, b) => (Math.abs(a.amount) >= Math.abs(b.amount) ? a : b));
    let allocated = 0;
    for (const e of entries) {
      if (e === remainderRow) continue;
      e.amount = round2((e.amount / oldSum) * total);
      allocated = round2(allocated + e.amount);
    }
    remainderRow.amount = round2(total - allocated);
  }

  await replaceAllocations(supabase, invoice.id, invoice.user_id, entries);
}
