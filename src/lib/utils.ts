import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
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

export function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

/** Confidence band → colour, per PRD §12 thresholds. */
export function confidenceColor(score: number | null | undefined): string {
  if (score === null || score === undefined) return "var(--muted)";
  if (score >= 0.9) return "var(--status-approved)";
  if (score >= 0.7) return "var(--status-review)";
  return "var(--status-low)";
}
