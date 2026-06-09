import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/**
 * Sanitise a post-auth `next` redirect target to a same-origin relative path —
 * prevents open redirects (`//evil.com`, `/\evil.com`, `https://…`). Returns the
 * fallback if the value isn't a plain in-app path.
 */
export function safeNextPath(
  next: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (
    typeof next === "string" &&
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !next.startsWith("/\\")
  ) {
    return next;
  }
  return fallback;
}

/** Format money in ZAR (or detected currency). PRD uses `R` symbol. */
export function formatMoney(
  value: number | null | undefined,
  currency = "ZAR",
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  try {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(value);
  } catch {
    return `R${value.toFixed(2)}`;
  }
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-ZA", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "0 KB";
  const mb = bytes / 1_048_576;
  if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

/** Normalise a VAT number for consistent display: strip all whitespace. */
export function formatVat(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = String(v).replace(/\s+/g, "");
  return s || null;
}

/** Confidence band → colour, per PRD §12 thresholds. */
export function confidenceColor(score: number | null | undefined): string {
  if (score === null || score === undefined) return "var(--muted)";
  if (score >= 0.9) return "var(--status-approved)";
  if (score >= 0.7) return "var(--status-review)";
  return "var(--status-low)";
}
