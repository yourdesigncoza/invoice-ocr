import type { SupabaseClient } from "@supabase/supabase-js";
import type { Supplier } from "@/lib/types";

/**
 * Multi-signal supplier matching (PRD §7.5). Same supplier recurs under
 * inconsistent names ("SPAR", "Hartenbos Spar & Tops", "Retail Spar Hartenbos")
 * and across branches. We score candidates on:
 *   exact → normalized → fuzzy (trigram) → VAT number → phone → address.
 * Historical user-approved matches are reinforced naturally because approving a
 * link writes the chosen supplier_id, growing that supplier's footprint.
 */

export interface SupplierMatch {
  supplier: Supplier;
  score: number; // 0–1
  reason: string;
}

/** Canonical form for comparison: lowercase, strip punctuation & common suffixes. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(pty|ltd|cc|inc|the|t\/a)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Levenshtein-based ratio in [0,1]. */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const dist = levenshtein(a, b);
  return 1 - dist / Math.max(a.length, b.length);
}

/**
 * Token containment in [0,1]: how many of the smaller name's words appear in
 * the larger. Order-insensitive, so "spar hartenbos" and "hartenbos spar and
 * tops" score 1.0. Ignored for single-token names to avoid over-matching a
 * common word like "spar".
 */
export function tokenOverlap(a: string, b: string): number {
  const ta = new Set(a.split(" ").filter(Boolean));
  const tb = new Set(b.split(" ").filter(Boolean));
  if (Math.min(ta.size, tb.size) < 2) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.min(ta.size, tb.size);
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return dp[n];
}

export interface MatchSignals {
  rawName: string | null;
  vatNumber?: string | null;
  phone?: string | null;
  address?: string | null;
}

/**
 * Rank existing suppliers against detected signals. Pure scoring over an
 * already-fetched candidate list (keeps it testable). Returns best-first.
 */
export function rankSuppliers(
  signals: MatchSignals,
  candidates: Supplier[],
): SupplierMatch[] {
  const norm = signals.rawName ? normalizeName(signals.rawName) : "";
  const matches: SupplierMatch[] = [];

  for (const c of candidates) {
    // strongest signals first — short-circuit to high confidence
    if (signals.vatNumber && c.vat_number && eq(signals.vatNumber, c.vat_number)) {
      matches.push({ supplier: c, score: 0.99, reason: "VAT number match" });
      continue;
    }
    if (signals.phone && c.phone && digits(signals.phone) === digits(c.phone)) {
      matches.push({ supplier: c, score: 0.95, reason: "Phone number match" });
      continue;
    }
    if (norm && c.normalized_name && norm === normalizeName(c.normalized_name)) {
      matches.push({ supplier: c, score: 0.97, reason: "Normalized name match" });
      continue;
    }
    if (norm) {
      const candNorm = normalizeName(c.normalized_name || c.supplier_name);
      // levenshtein is word-order sensitive; token overlap catches reordered /
      // abbreviated variants ("Hartenbos Spar & Tops" vs "SPAR Hartenbos").
      const best = Math.max(similarity(norm, candNorm), tokenOverlap(norm, candNorm));
      if (best >= 0.8) {
        matches.push({
          supplier: c,
          score: 0.6 + best * 0.35,
          reason: `Fuzzy name match (${Math.round(best * 100)}%)`,
        });
        continue;
      }
      // address tiebreaker for weak name matches
      if (best >= 0.5 && signals.address && c.address) {
        const aSim = similarity(
          normalizeName(signals.address),
          normalizeName(c.address),
        );
        if (aSim >= 0.7)
          matches.push({
            supplier: c,
            score: 0.55 + aSim * 0.2,
            reason: "Similar name + address",
          });
      }
    }
  }

  return matches.sort((x, y) => y.score - x.score);
}

/**
 * DB-backed convenience: pull trigram candidates then rank. Uses pg_trgm via
 * the `%` operator behind a SECURITY-safe ilike fallback when RPC absent.
 */
export async function findSupplierMatches(
  supabase: SupabaseClient,
  signals: MatchSignals,
  limit = 5,
): Promise<SupplierMatch[]> {
  // candidate pool kept small; ranking happens in-process so it's testable.
  // (pg_trgm index supports scaling this to a server-side prefilter later.)
  const { data } = await supabase.from("suppliers").select("*").limit(200);
  const candidates = (data ?? []) as Supplier[];
  return rankSuppliers(signals, candidates).slice(0, limit);
}

/**
 * Auto-link floor: VAT (0.99), phone (0.95), normalized-name (0.97) and only
 * the strongest fuzzy matches (≥ ~86% similarity) qualify. Below it we create
 * a fresh silo instead — a wrong merge silently corrupts spend-per-supplier,
 * while a near-duplicate silo is visible and fixable by re-linking in review.
 */
export const AUTO_LINK_THRESHOLD = 0.9;

/** Pure decision: which match (if any) is safe to link without a human. */
export function pickAutoLink(matches: SupplierMatch[]): SupplierMatch | null {
  const best = matches[0];
  return best && best.score >= AUTO_LINK_THRESHOLD ? best : null;
}

/**
 * Auto-silo on approval (the reviewer just approved an invoice showing this
 * supplier name, so materialising the silo is the expected outcome): link a
 * high-confidence existing supplier, else create one from the approved
 * details. Returns null only when there is no usable name. Pass an RLS-scoped
 * client and the caller's user id (every insert must stamp user_id).
 */
export async function resolveSupplierOnApproval(
  supabase: SupabaseClient,
  userId: string,
  signals: MatchSignals,
): Promise<{ supplierId: string; created: boolean; reason: string } | null> {
  const rawName = signals.rawName?.trim();
  if (!rawName) return null;

  const matches = await findSupplierMatches(supabase, signals);
  const auto = pickAutoLink(matches);
  if (auto) {
    return { supplierId: auto.supplier.id, created: false, reason: auto.reason };
  }

  const { data, error } = await supabase
    .from("suppliers")
    .insert({
      supplier_name: rawName,
      normalized_name: normalizeName(rawName),
      vat_number: signals.vatNumber || null,
      phone: signals.phone || null,
      address: signals.address || null,
      user_id: userId,
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`auto-silo: ${error?.message ?? "insert failed"}`);
  }
  return { supplierId: data.id, created: true, reason: "New silo from approved name" };
}

function eq(a: string, b: string) {
  return a.replace(/\s/g, "").toLowerCase() === b.replace(/\s/g, "").toLowerCase();
}
function digits(s: string) {
  return s.replace(/\D/g, "");
}
