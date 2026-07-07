import "server-only";
import { createServerSupabase, isSupabaseConfigured } from "./supabase/server";
import type {
  Invoice,
  InvoiceWithSupplier,
  Supplier,
  Project,
  InvoiceItem,
  InvoiceSiteAllocation,
  DuplicateCheck,
  UserSettings,
} from "./types";
import { DEFAULT_CURRENCY, type InvoiceStatus, type PaymentStatus } from "./constants";
import { formatVat } from "./utils";

export { isSupabaseConfigured };

// Reads run as the signed-in user via the cookie-bound client, so RLS scopes
// every query to the caller (multi-tenant). Writes/admin paths use the
// service-role client explicitly where needed.
async function db() {
  return createServerSupabase();
}

export interface InvoiceFilters {
  status?: InvoiceStatus | InvoiceStatus[];
  paymentStatus?: PaymentStatus;
  supplierId?: string;
  projectId?: string;
  from?: string;
  to?: string;
  search?: string;
  limit?: number;
}

export async function getInvoices(
  filters: InvoiceFilters = {},
): Promise<InvoiceWithSupplier[]> {
  const supabase = await db();
  if (!supabase) return [];
  // Site filter goes through invoice_site_allocations (the per-site source of
  // truth): a split invoice belongs to every site it has an allocation for,
  // and the row carries that site's share as `allocated_amount`. Two-query
  // shape (allocations → ids → invoices) keeps the main select simple.
  let allocatedByInvoice: Map<string, number> | null = null;
  if (filters.projectId) {
    const { data: allocs, error: allocErr } = await supabase
      .from("invoice_site_allocations")
      .select("invoice_id, amount")
      .eq("project_id", filters.projectId);
    if (allocErr) {
      console.error("getInvoices allocations", allocErr.message);
      return [];
    }
    if (!allocs?.length) return [];
    allocatedByInvoice = new Map(
      allocs.map((a) => [a.invoice_id as string, Number(a.amount)]),
    );
  }

  let q = supabase
    .from("invoices")
    .select(
      "*, supplier:suppliers(*), project:projects(*), duplicate_checks!duplicate_checks_invoice_id_fkey(count), invoice_site_allocations(count)",
    )
    .order("invoice_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 200);

  if (filters.status)
    q = Array.isArray(filters.status)
      ? q.in("status", filters.status)
      : q.eq("status", filters.status);
  if (filters.paymentStatus) q = q.eq("payment_status", filters.paymentStatus);
  if (filters.supplierId) q = q.eq("supplier_id", filters.supplierId);
  if (allocatedByInvoice) q = q.in("id", [...allocatedByInvoice.keys()]);
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
  return (data ?? []).map((row) => {
    const flat = flattenAggregates(row) as InvoiceWithSupplier;
    const allocated = allocatedByInvoice?.get(flat.id);
    if (allocated !== undefined) flat.allocated_amount = allocated;
    return flat;
  });
}

// Supabase returns count aggregates as `relation: [{ count }]`; flatten them to
// plain numbers (`duplicate_count`, `allocation_count`) and drop the relations.
function flattenAggregates(row: Record<string, unknown>): unknown {
  const dc = row.duplicate_checks as { count: number }[] | undefined;
  const ac = row.invoice_site_allocations as { count: number }[] | undefined;
  const { duplicate_checks: _d, invoice_site_allocations: _a, ...rest } = row;
  void _d;
  void _a;
  return {
    ...rest,
    duplicate_count: dc?.[0]?.count ?? 0,
    allocation_count: ac?.[0]?.count ?? 0,
  };
}

export async function getInvoice(id: string): Promise<{
  invoice: InvoiceWithSupplier;
  items: InvoiceItem[];
  allocations: InvoiceSiteAllocation[];
} | null> {
  const supabase = await db();
  if (!supabase) return null;
  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      "*, supplier:suppliers(*), project:projects(*), duplicate_checks!duplicate_checks_invoice_id_fkey(count)",
    )
    .eq("id", id)
    .single();
  if (!invoice) return null;
  const [{ data: items }, { data: allocations }] = await Promise.all([
    supabase.from("invoice_items").select("*").eq("invoice_id", id),
    supabase
      .from("invoice_site_allocations")
      .select("*, project:projects(id, name, color)")
      .eq("invoice_id", id),
  ]);
  return {
    invoice: flattenAggregates(invoice) as InvoiceWithSupplier,
    items: (items ?? []) as InvoiceItem[],
    allocations: (allocations ?? []) as InvoiceSiteAllocation[],
  };
}

export async function getSuppliers(): Promise<
  (Supplier & {
    invoice_count: number;
    total_spend: number;
    vat_numbers: string[];
  })[]
> {
  const supabase = await db();
  if (!supabase) return [];
  const { data: suppliers } = await supabase.from("suppliers").select("*");
  if (!suppliers) return [];
  // aggregate approved spend + collect VAT numbers detected on invoices
  const { data: invoices } = await supabase
    .from("invoices")
    .select("supplier_id, total_incl_vat, status, vat_number");
  const agg = new Map<
    string,
    { count: number; spend: number; vats: Map<string, string> }
  >();
  for (const inv of invoices ?? []) {
    if (!inv.supplier_id) continue;
    const a =
      agg.get(inv.supplier_id) ?? { count: 0, spend: 0, vats: new Map() };
    if (inv.status === "approved") {
      a.count += 1;
      a.spend += Number(inv.total_incl_vat ?? 0);
    }
    // dedupe distinct VAT numbers by digits; store whitespace-stripped value
    if (inv.vat_number) {
      const key = String(inv.vat_number).replace(/\D/g, "");
      if (key && !a.vats.has(key)) a.vats.set(key, formatVat(inv.vat_number)!);
    }
    agg.set(inv.supplier_id, a);
  }
  return (suppliers as Supplier[]).map((s) => {
    const a = agg.get(s.id);
    const vats = a ? [...a.vats.values()] : [];
    // include the supplier's own stored VAT number if not already present
    if (s.vat_number && !vats.some((v) => v.replace(/\D/g, "") === s.vat_number!.replace(/\D/g, ""))) {
      vats.unshift(formatVat(s.vat_number)!);
    }
    return {
      ...s,
      invoice_count: a?.count ?? 0,
      total_spend: a?.spend ?? 0,
      vat_numbers: vats,
    };
  });
}

export async function getSupplier(id: string): Promise<Supplier | null> {
  const supabase = await db();
  if (!supabase) return null;
  const { data } = await supabase.from("suppliers").select("*").eq("id", id).single();
  return (data as Supplier) ?? null;
}

// ── Projects / sites (cost centres) ──────────────────────────────────────────

/**
 * Active projects + approved invoice_count & total_spend. Per-site amounts come
 * from invoice_site_allocations (the source of truth): a split invoice
 * contributes its allocated share to each site it touches — and counts once
 * per site it touches. Never sum invoice totals per site here (double-counts
 * splits); whole-account numbers (dashboard) stay invoice-based.
 */
export async function getProjects(): Promise<
  (Project & { invoice_count: number; total_spend: number })[]
> {
  const supabase = await db();
  if (!supabase) return [];
  const { data: projects } = await supabase
    .from("projects")
    .select("*")
    .eq("archived", false)
    .order("name");
  if (!projects) return [];
  const { data: allocs } = await supabase
    .from("invoice_site_allocations")
    .select("project_id, amount, invoice:invoices!inner(status)");
  const agg = new Map<string, { count: number; spend: number }>();
  for (const a of allocs ?? []) {
    const inv = a.invoice as unknown as { status: string } | null;
    if (inv?.status !== "approved") continue;
    const cur = agg.get(a.project_id) ?? { count: 0, spend: 0 };
    cur.count += 1;
    cur.spend += Number(a.amount ?? 0);
    agg.set(a.project_id, cur);
  }
  return (projects as Project[]).map((p) => ({
    ...p,
    invoice_count: agg.get(p.id)?.count ?? 0,
    total_spend: agg.get(p.id)?.spend ?? 0,
  }));
}

/**
 * Site allocations for a set of invoices, keyed by invoice id (with project
 * names) — feeds the per-allocation CSV export rows.
 */
export async function getAllocationsByInvoice(
  invoiceIds: string[],
): Promise<Map<string, InvoiceSiteAllocation[]>> {
  const map = new Map<string, InvoiceSiteAllocation[]>();
  if (!invoiceIds.length) return map;
  const supabase = await db();
  if (!supabase) return map;
  const { data } = await supabase
    .from("invoice_site_allocations")
    .select("*, project:projects(id, name, color)")
    .in("invoice_id", invoiceIds);
  for (const a of (data ?? []) as InvoiceSiteAllocation[]) {
    const list = map.get(a.invoice_id) ?? [];
    list.push(a);
    map.set(a.invoice_id, list);
  }
  return map;
}

/** Lightweight active-project list for pickers. */
export async function getActiveProjects(): Promise<Project[]> {
  const supabase = await db();
  if (!supabase) return [];
  const { data } = await supabase
    .from("projects")
    .select("*")
    .eq("archived", false)
    .order("name");
  return (data ?? []) as Project[];
}

/** The adaptive gate: project UI only surfaces once the user has ≥2 sites. */
export async function projectsEnabled(): Promise<boolean> {
  return (await getActiveProjects()).length >= 2;
}

/**
 * Current user's preferences (RLS-scoped). The row is created lazily on first
 * save, so absence is normal — fall back to app defaults rather than erroring.
 */
export async function getUserSettings(): Promise<UserSettings> {
  const supabase = await db();
  const fallback: UserSettings = {
    user_id: "",
    default_currency: DEFAULT_CURRENCY,
    updated_at: "",
  };
  if (!supabase) return fallback;
  const { data } = await supabase
    .from("user_settings")
    .select("*")
    .maybeSingle();
  return (data as UserSettings) ?? fallback;
}

export async function getProject(id: string): Promise<Project | null> {
  const supabase = await db();
  if (!supabase) return null;
  const { data } = await supabase.from("projects").select("*").eq("id", id).single();
  return (data as Project) ?? null;
}

export async function getOpenDuplicates(): Promise<
  (DuplicateCheck & {
    invoice: Invoice | null;
    possible_duplicate: Invoice | null;
  })[]
> {
  const supabase = await db();
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
  const supabase = await db();
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
