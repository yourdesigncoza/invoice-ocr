// Pure allocation math — client-safe (the review UI derives the live split
// preview with the exact same functions the server persists with; never
// reimplement this in a component). No supabase / server-only imports.
//
// Invariant: every result's amounts sum EXACTLY to total_incl_vat — the
// default/remainder row is computed as `total − Σ(other rounded rows)`, so
// cent rounding, VAT presentation differences, and missed lines are absorbed
// there rather than drifting the sum.

export type AllocationSource = "default" | "items" | "manual";

export interface AllocationEntry {
  project_id: string;
  amount: number;
  source: AllocationSource;
}

export interface TaggableItem {
  id: string;
  line_total: number | null;
  /** null = the invoice's default site */
  project_id: string | null;
}

export type SplitResult =
  | { ok: true; entries: AllocationEntry[] }
  | { ok: false; error: string };

/** PATCH /api/invoices/[id] `split` payload — shared by the editor and route. */
export type SplitPayload =
  | { mode: "items"; itemProjects: Record<string, string | null> }
  | { mode: "manual"; exceptions: { project_id: string; amount: number }[] }
  | { mode: "clear" };

export const round2 = (n: number) => Math.round(n * 100) / 100;

const num = (v: number | string | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Single 'default' row mirroring invoices.project_id (unsplit invoice). */
export function defaultAllocation(
  projectId: string | null,
  total: number | null,
): AllocationEntry[] {
  if (!projectId) return [];
  return [{ project_id: projectId, amount: round2(num(total)), source: "default" }];
}

/**
 * Proportional gross-up from line-item site tags (default-plus-exceptions):
 * each site's share of the item sums, applied to total_incl_vat. Untagged
 * items belong to the default site. Refuses (rather than guessing) when the
 * weights are unusable — mixed-sign/zero item sums from discount or return
 * lines — so the UI can offer the manual split instead.
 */
export function deriveFromItems(
  items: TaggableItem[],
  defaultProjectId: string | null,
  totalInclVat: number | null,
): SplitResult {
  const hasTags = items.some((it) => it.project_id && it.project_id !== defaultProjectId);

  // Degenerate-but-innocent cases → plain default allocation, not an error.
  if (!hasTags || totalInclVat === null || totalInclVat === undefined) {
    return { ok: true, entries: defaultAllocation(defaultProjectId, totalInclVat) };
  }

  const total = num(totalInclVat);

  // Effective site per item; weights are the per-site line_total sums.
  const weights = new Map<string, number>(); // key: project_id or "" (default)
  for (const it of items) {
    const key = it.project_id ?? defaultProjectId ?? "";
    weights.set(key, (weights.get(key) ?? 0) + num(it.line_total));
  }
  const grand = [...weights.values()].reduce((s, w) => s + w, 0);

  // Mixed-sign / zero weights (discount or return lines): refuse — a signed
  // proportional split produces shares users can't reconcile.
  if (grand <= 0 || [...weights.values()].some((w) => w < 0)) {
    return {
      ok: false,
      error: "Line totals can't be split proportionally — use the manual split.",
    };
  }

  // No default site + untagged lines: the untagged share has nowhere to go
  // (folding it into a tagged site would silently misallocate it).
  if (!defaultProjectId && (weights.get("") ?? 0) !== 0) {
    return {
      ok: false,
      error: "Assign the invoice a site first, or tag every line item.",
    };
  }

  const defaultKey = defaultProjectId ?? "";
  const others = [...weights.entries()].filter(([k]) => k !== defaultKey);

  const entries: AllocationEntry[] = [];
  let allocated = 0;
  for (const [projectId, weight] of others) {
    if (weight === 0) continue; // zero-weight tag adds nothing
    const amount = round2((weight / grand) * total);
    entries.push({ project_id: projectId, amount, source: "items" });
    allocated += amount;
  }

  const remainder = round2(total - allocated);
  if (defaultProjectId) {
    entries.push({ project_id: defaultProjectId, amount: remainder, source: "items" });
  } else if (remainder !== 0 && entries.length > 0) {
    // No default site (invoice unsited, every item explicitly tagged):
    // remainder (cent rounding only, since defaultKey had no weight) goes to
    // the largest-weight row.
    const largest = others.reduce((a, b) => (Math.abs(a[1]) >= Math.abs(b[1]) ? a : b));
    const row = entries.find((e) => e.project_id === largest[0]);
    if (row) row.amount = round2(row.amount + remainder);
  }

  return { ok: true, entries };
}

/**
 * Manual fallback (no usable line items): rand amounts for exception sites;
 * the default site takes the remainder automatically.
 */
export function manualSplit(
  exceptions: { project_id: string; amount: number }[],
  defaultProjectId: string | null,
  totalInclVat: number | null,
): SplitResult {
  if (totalInclVat === null || totalInclVat === undefined) {
    return { ok: false, error: "The invoice needs a total before it can be split." };
  }
  const total = num(totalInclVat);
  if (exceptions.length === 0) {
    return { ok: true, entries: defaultAllocation(defaultProjectId, total) };
  }

  const seen = new Set<string>();
  const sign = total < 0 ? -1 : 1;
  let sum = 0;
  for (const ex of exceptions) {
    if (!ex.project_id) return { ok: false, error: "Every split line needs a site." };
    if (ex.project_id === defaultProjectId) {
      return { ok: false, error: "The default site takes the remainder — split only the exceptions." };
    }
    if (seen.has(ex.project_id)) return { ok: false, error: "Each site can appear only once." };
    seen.add(ex.project_id);
    const amount = round2(num(ex.amount));
    if (amount === 0 || amount * sign < 0) {
      return { ok: false, error: "Split amounts must be non-zero and match the invoice's sign." };
    }
    sum = round2(sum + amount);
  }

  const remainder = round2(total - sum);
  if (remainder * sign < 0) {
    return { ok: false, error: "Split amounts exceed the invoice total." };
  }

  const entries: AllocationEntry[] = exceptions.map((ex) => ({
    project_id: ex.project_id,
    amount: round2(num(ex.amount)),
    source: "manual",
  }));
  if (remainder !== 0) {
    if (!defaultProjectId) {
      return { ok: false, error: "Assign a default site or split the full total." };
    }
    entries.push({ project_id: defaultProjectId, amount: remainder, source: "manual" });
  }
  return { ok: true, entries };
}

/** Test/assert helper: do the entries reconcile to the invoice total? */
export function sumsToTotal(entries: AllocationEntry[], total: number | null): boolean {
  const sum = entries.reduce((s, e) => s + e.amount, 0);
  return Math.abs(round2(sum) - round2(num(total))) < 0.005;
}
