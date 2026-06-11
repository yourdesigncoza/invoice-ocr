// Domain enums & UI constants. Single source of truth (DRY) — DB enums,
// Zod schema, and UI all import from here. Mirrors PRD §7.4, §8.4, §10, §12.

export const INVOICE_STATUSES = [
  "processing",
  "needs_review",
  "approved",
  "rejected",
  "low_confidence",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const DOCUMENT_TYPES = [
  "Tax Invoice",
  "Receipt",
  "Cash Sale",
  "Credit Note",
  "Purchase Notice",
  "Prepaid Electricity",
  "Statement",
  "Unknown",
  "Not Invoice",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const PAYMENT_METHODS = [
  "Cash",
  "Card",
  "EFT",
  "Account",
  "COD",
  "Unknown",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = [
  "Paid",
  "Unpaid",
  "Unknown",
  "COD",
  "Account",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const DEFAULT_CURRENCY = "ZAR";

// Currency is a per-user setting (Settings → Preferences), not a per-invoice
// field. ZAR-first, then the currencies most relevant to the SA / broader
// African + global market. Each new invoice is stamped with the user's choice.
export const CURRENCIES = [
  { code: "ZAR", label: "South African Rand (R)" },
  { code: "USD", label: "US Dollar ($)" },
  { code: "EUR", label: "Euro (€)" },
  { code: "GBP", label: "British Pound (£)" },
  { code: "NGN", label: "Nigerian Naira (₦)" },
  { code: "KES", label: "Kenyan Shilling (KSh)" },
  { code: "AUD", label: "Australian Dollar (A$)" },
  { code: "CAD", label: "Canadian Dollar (C$)" },
  { code: "AED", label: "UAE Dirham (د.إ)" },
  { code: "INR", label: "Indian Rupee (₹)" },
] as const;
export type CurrencyCode = (typeof CURRENCIES)[number]["code"];
export const CURRENCY_CODES = CURRENCIES.map((c) => c.code) as readonly string[];

// PRD §12 confidence thresholds
export const CONFIDENCE = {
  high: 0.9, // >= 0.90  → can be approved quickly
  medium: 0.7, // 0.70–0.89 → review required
  // < 0.70   → manual correction required (low_confidence)
} as const;

// Maps a status to its semantic colour (PRD §10.2). Tailwind v4 reads these
// from the @theme tokens defined in globals.css.
export const STATUS_META: Record<
  InvoiceStatus,
  { label: string; color: string; bg: string }
> = {
  processing: { label: "Processing", color: "#3b82f6", bg: "#eff6ff" },
  needs_review: { label: "Needs Review", color: "#f59e0b", bg: "#fffbeb" },
  approved: { label: "Approved", color: "#16a34a", bg: "#f0fdf4" },
  rejected: { label: "Rejected", color: "#6b7280", bg: "#f9fafb" },
  low_confidence: { label: "Low Confidence", color: "#dc2626", bg: "#fef2f2" },
};

// Left sidebar (PRD §9.2)
export const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
  { href: "/upload", label: "Upload", icon: "Upload" },
  { href: "/review", label: "Review Queue", icon: "ClipboardCheck" },
  { href: "/invoices", label: "Invoices", icon: "Table2" },
  { href: "/suppliers", label: "Suppliers", icon: "Building2" },
  { href: "/duplicates", label: "Duplicates", icon: "CopyCheck" },
  { href: "/reports", label: "Reports", icon: "FileBarChart" },
  { href: "/exports", label: "Exports", icon: "Download" },
  { href: "/getting-started", label: "Getting Started", icon: "BookOpen" },
  { href: "/settings", label: "Settings", icon: "Settings" },
] as const;

export const STORAGE_BUCKET = "invoices";
