import type { SupabaseClient } from "@supabase/supabase-js";
import type { Invoice } from "@/lib/types";

/**
 * Duplicate detection (PRD §7.10). Runs before approval.
 *   Primary key:  Supplier + Invoice Number + Date + Total
 *   Fallback (no invoice number, common on till slips):
 *                 Supplier + Date + Total  (+ image similarity, future)
 */

export interface DuplicateHit {
  invoice: Invoice;
  score: number;
  reason: string;
}

export interface DuplicateProbe {
  id?: string; // exclude self when re-checking an existing invoice
  supplier_id: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  total_incl_vat: number | null;
}

export async function findDuplicates(
  supabase: SupabaseClient,
  probe: DuplicateProbe,
): Promise<DuplicateHit[]> {
  if (!probe.supplier_id || probe.total_incl_vat === null) return [];

  let query = supabase
    .from("invoices")
    .select("*")
    .eq("supplier_id", probe.supplier_id)
    .eq("total_incl_vat", probe.total_incl_vat)
    .neq("status", "rejected");

  if (probe.id) query = query.neq("id", probe.id);

  const { data } = await query.limit(25);
  const candidates = (data ?? []) as Invoice[];

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
