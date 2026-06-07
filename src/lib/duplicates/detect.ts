import type { SupabaseClient } from "@supabase/supabase-js";
import type { Invoice } from "@/lib/types";
import { normalizeName } from "@/lib/suppliers/matching";

/**
 * Duplicate detection (PRD §7.10). Runs at upload, before approval.
 *   Primary key:  Supplier + Invoice Number + Date + Total
 *   Fallback (no invoice number, common on till slips):
 *                 Supplier + Date + Total  (+ image similarity, future)
 *
 * "Supplier" is matched by the linked silo (supplier_id) when available, and
 * otherwise by the normalised extracted name (original_supplier_name) — uploads
 * aren't linked to a silo yet, so name matching is what makes detection fire at
 * upload time rather than only after a reviewer links the supplier.
 */

export interface DuplicateHit {
  invoice: Invoice;
  score: number;
  reason: string;
}

export interface DuplicateProbe {
  id?: string; // exclude self when re-checking an existing invoice
  supplier_id: string | null;
  original_supplier_name?: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  total_incl_vat: number | null;
}

export async function findDuplicates(
  supabase: SupabaseClient,
  probe: DuplicateProbe,
): Promise<DuplicateHit[]> {
  if (probe.total_incl_vat === null) return [];
  // need at least one supplier signal to avoid matching unrelated invoices
  if (!probe.supplier_id && !probe.original_supplier_name) return [];

  let query = supabase
    .from("invoices")
    .select("*")
    .eq("total_incl_vat", probe.total_incl_vat)
    .neq("status", "rejected");

  // narrow by silo when linked; otherwise we filter by name below
  if (probe.supplier_id) query = query.eq("supplier_id", probe.supplier_id);
  if (probe.id) query = query.neq("id", probe.id);

  const { data } = await query.limit(50);
  let candidates = (data ?? []) as Invoice[];

  // unlinked upload: keep only candidates whose extracted supplier name matches
  if (!probe.supplier_id && probe.original_supplier_name) {
    const target = normalizeName(probe.original_supplier_name);
    candidates = candidates.filter(
      (c) =>
        c.original_supplier_name &&
        normalizeName(c.original_supplier_name) === target,
    );
  }

  const hits: DuplicateHit[] = [];
  for (const c of candidates) {
    // primary: same invoice number + date
    if (
      probe.invoice_number &&
      c.invoice_number &&
      norm(probe.invoice_number) === norm(c.invoice_number) &&
      probe.invoice_date === c.invoice_date
    ) {
      hits.push({
        invoice: c,
        score: 0.98,
        reason: "Same supplier, invoice number, date and total",
      });
      continue;
    }
    // fallback: same supplier + date + total (invoice number missing/differs)
    if (probe.invoice_date && probe.invoice_date === c.invoice_date) {
      hits.push({
        invoice: c,
        score: 0.85,
        reason: "Same supplier, date and total",
      });
    }
  }
  return hits.sort((a, b) => b.score - a.score);
}

function norm(s: string) {
  return s.replace(/\s/g, "").toLowerCase();
}
