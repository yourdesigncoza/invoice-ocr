import "server-only";
import { createAdminSupabase, isSupabaseConfigured } from "./supabase/server";
import type {
  Invoice,
  InvoiceWithSupplier,
  Supplier,
  InvoiceItem,
  DuplicateCheck,
} from "./types";
import type { InvoiceStatus } from "./constants";

export { isSupabaseConfigured };

// MVP uses the service-role client for reads (no auth layer yet). Swap to the
// cookie-bound client once roles (PRD §5) land.
function db() {
  return createAdminSupabase();
}

export interface InvoiceFilters {
  status?: InvoiceStatus | InvoiceStatus[];
  supplierId?: string;
  from?: string;
  to?: string;
  search?: string;
  limit?: number;
}

export async function getInvoices(
  filters: InvoiceFilters = {},
): Promise<InvoiceWithSupplier[]> {
  const supabase = db();
  if (!supabase) return [];
  let q = supabase
    .from("invoices")
    .select("*, supplier:suppliers(*)")
    .order("invoice_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 200);

  if (filters.status)
    q = Array.isArray(filters.status)
      ? q.in("status", filters.status)
      : q.eq("status", filters.status);
  if (filters.supplierId) q = q.eq("supplier_id", filters.supplierId);
  if (filters.from) q = q.gte("invoice_date", filters.from);
  if (filters.to) q = q.lte("invoice_date", filters.to);
  if (filters.search)
    q = q.or(
      `original_supplier_name.ilike.%${filters.search}%,invoice_number.ilike.%${filters.search}%`,
    );

  const { data, error } = await q;
  if (error) {
    console.error("getInvoices", error.message);
    return [];
  }
  return (data ?? []) as InvoiceWithSupplier[];
}

export async function getInvoice(
  id: string,
): Promise<{ invoice: InvoiceWithSupplier; items: InvoiceItem[] } | null> {
  const supabase = db();
  if (!supabase) return null;
  const { data: invoice } = await supabase
    .from("invoices")
    .select("*, supplier:suppliers(*)")
    .eq("id", id)
    .single();
  if (!invoice) return null;
  const { data: items } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", id);
  return {
    invoice: invoice as InvoiceWithSupplier,
    items: (items ?? []) as InvoiceItem[],
  };
}

export async function getSuppliers(): Promise<
  (Supplier & { invoice_count: number; total_spend: number })[]
> {
  const supabase = db();
  if (!supabase) return [];
  const { data: suppliers } = await supabase.from("suppliers").select("*");
  if (!suppliers) return [];
  // aggregate approved spend per supplier
  const { data: invoices } = await supabase
    .from("invoices")
    .select("supplier_id, total_incl_vat, status");
  const agg = new Map<string, { count: number; spend: number }>();
  for (const inv of invoices ?? []) {
    if (!inv.supplier_id || inv.status !== "approved") continue;
    const a = agg.get(inv.supplier_id) ?? { count: 0, spend: 0 };
    a.count += 1;
    a.spend += Number(inv.total_incl_vat ?? 0);
    agg.set(inv.supplier_id, a);
  }
  return (suppliers as Supplier[]).map((s) => ({
    ...s,
    invoice_count: agg.get(s.id)?.count ?? 0,
    total_spend: agg.get(s.id)?.spend ?? 0,
  }));
}

export async function getSupplier(id: string): Promise<Supplier | null> {
  const supabase = db();
  if (!supabase) return null;
  const { data } = await supabase.from("suppliers").select("*").eq("id", id).single();
  return (data as Supplier) ?? null;
}

export async function getOpenDuplicates(): Promise<
  (DuplicateCheck & {
    invoice: Invoice | null;
    possible_duplicate: Invoice | null;
  })[]
> {
  const supabase = db();
  if (!supabase) return [];
  const { data } = await supabase
    .from("duplicate_checks")
    .select(
      "*, invoice:invoices!duplicate_checks_invoice_id_fkey(*), possible_duplicate:invoices!duplicate_checks_possible_duplicate_invoice_id_fkey(*)",
    )
    .eq("status", "open")
    .order("match_score", { ascending: false });
  return (data ?? []) as never;
}

export interface DashboardData {
  totalSpend: number;
  totalVat: number;
  invoiceCount: number;
  avgInvoice: number;
  pendingReview: number;
  duplicateWarnings: number;
  topSupplier: { name: string; spend: number } | null;
  unmatchedSuppliers: number;
}

/** Approved-only KPI roll-up for a date window (PRD §7.7). */
export async function getDashboard(
  from?: string,
  to?: string,
): Promise<DashboardData | null> {
  const supabase = db();
  if (!supabase) return null;

  let approvedQ = supabase
    .from("invoices")
    .select("total_incl_vat, vat_amount, supplier_id, original_supplier_name")
    .eq("status", "approved");
  if (from) approvedQ = approvedQ.gte("invoice_date", from);
  if (to) approvedQ = approvedQ.lte("invoice_date", to);
  const { data: approved } = await approvedQ;

  const rows = approved ?? [];
  const totalSpend = rows.reduce((s, r) => s + Number(r.total_incl_vat ?? 0), 0);
  const totalVat = rows.reduce((s, r) => s + Number(r.vat_amount ?? 0), 0);
  const invoiceCount = rows.length;

  const bySupplier = new Map<string, number>();
  for (const r of rows) {
    const key = r.original_supplier_name || "Unknown";
    bySupplier.set(key, (bySupplier.get(key) ?? 0) + Number(r.total_incl_vat ?? 0));
  }
  const top = [...bySupplier.entries()].sort((a, b) => b[1] - a[1])[0];

  const { count: pendingReview } = await supabase
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .in("status", ["needs_review", "low_confidence", "processing"]);
  const { count: duplicateWarnings } = await supabase
    .from("duplicate_checks")
    .select("id", { count: "exact", head: true })
    .eq("status", "open");
  const { count: unmatched } = await supabase
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .is("supplier_id", null);

  return {
    totalSpend,
    totalVat,
    invoiceCount,
    avgInvoice: invoiceCount ? totalSpend / invoiceCount : 0,
    pendingReview: pendingReview ?? 0,
    duplicateWarnings: duplicateWarnings ?? 0,
    topSupplier: top ? { name: top[0], spend: top[1] } : null,
    unmatchedSuppliers: unmatched ?? 0,
  };
}
