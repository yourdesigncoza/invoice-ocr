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

// Format/parse in LOCAL date components. Using toISOString()/`new Date(iso)`
// would convert through UTC and drift the day by one in timezones ahead of UTC
// (e.g. SAST, UTC+2) at month/quarter boundaries. Invoice dates are date-only,
// so we stay in local date space throughout.
function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
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
  const d = parseISO(isoDate);
  const y = d.getFullYear();
  switch (group) {
    case "day":
      return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
    case "week":
      return weekLabel(d);
    case "month":
      return d.toLocaleDateString("en-ZA", { year: "numeric", month: "short" });
    case "quarter":
      return `Q${Math.floor(d.getMonth() / 3) + 1} ${y}`;
    case "year":
      return String(y);
  }
}

/** The from/to date window of the bucket that contains `isoDate` (PRD §7.8). */
export function bucketRange(isoDate: string, group: GroupBy): DateRange {
  const d = parseISO(isoDate);
  const y = d.getFullYear();
  const m = d.getMonth();
  switch (group) {
    case "day":
      return { from: isoDate, to: isoDate };
    case "week": {
      const day = (d.getDay() + 6) % 7; // Monday = 0
      const start = new Date(d);
      start.setDate(d.getDate() - day);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return { from: iso(start), to: iso(end) };
    }
    case "month":
      return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
    case "quarter": {
      const q = Math.floor(m / 3);
      return { from: iso(new Date(y, q * 3, 1)), to: iso(new Date(y, q * 3 + 3, 0)) };
    }
    case "year":
      return { from: iso(new Date(y, 0, 1)), to: iso(new Date(y, 11, 31)) };
  }
}

/**
 * Human week label as a date range rather than an ISO week number, e.g.
 * "Jul 13–19, 2026" (same month) or "Dec 29 – Jan 4, 2026" (spanning months).
 * Week runs Monday–Sunday.
 */
function weekLabel(d: Date): string {
  const day = (d.getDay() + 6) % 7; // Monday = 0
  const start = new Date(d);
  start.setDate(d.getDate() - day);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const mon = (x: Date) => x.toLocaleDateString("en-ZA", { month: "short" });
  const yr = end.getFullYear();
  if (start.getMonth() === end.getMonth()) {
    return `${mon(start)} ${start.getDate()}–${end.getDate()}, ${yr}`;
  }
  return `${mon(start)} ${start.getDate()} – ${mon(end)} ${end.getDate()}, ${yr}`;
}
