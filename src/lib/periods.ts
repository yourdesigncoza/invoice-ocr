// Date-window helpers for time-based reporting (PRD §7.7/§7.8). Pure functions
// over a reference date so they're testable and SSR-stable.

export type Period =
  | "today"
  | "this_week"
  | "this_month"
  | "this_quarter"
  | "this_year"
  | "all";

export interface DateRange {
  from?: string; // ISO YYYY-MM-DD
  to?: string;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Range for a named period, relative to `ref` (defaults to now at call site). */
export function rangeFor(period: Period, ref: Date): DateRange {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  switch (period) {
    case "today":
      return { from: iso(ref), to: iso(ref) };
    case "this_week": {
      const day = (ref.getDay() + 6) % 7; // Monday = 0
      const start = new Date(ref);
      start.setDate(ref.getDate() - day);
      return { from: iso(start), to: iso(ref) };
    }
    case "this_month":
      return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
    case "this_quarter": {
      const q = Math.floor(m / 3);
      return { from: iso(new Date(y, q * 3, 1)), to: iso(new Date(y, q * 3 + 3, 0)) };
    }
    case "this_year":
      return { from: iso(new Date(y, 0, 1)), to: iso(new Date(y, 11, 31)) };
    case "all":
    default:
      return {};
  }
}

export type GroupBy = "day" | "week" | "month" | "quarter" | "year";

/** Bucket key for grouping an ISO date (PRD §7.8). */
export function bucketKey(isoDate: string, group: GroupBy): string {
  const d = new Date(isoDate);
  const y = d.getFullYear();
  switch (group) {
    case "day":
      return isoDate;
    case "week": {
      const week = isoWeek(d);
      return `Week ${week}, ${y}`;
    }
    case "month":
      return d.toLocaleDateString("en-ZA", { year: "numeric", month: "short" });
    case "quarter":
      return `Q${Math.floor(d.getMonth() / 3) + 1} ${y}`;
    case "year":
      return String(y);
  }
}

function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const diff = date.getTime() - firstThursday.getTime();
  return 1 + Math.round(diff / (7 * 24 * 3600 * 1000));
}
