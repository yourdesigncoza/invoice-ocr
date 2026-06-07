import Link from "next/link";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {subtitle && <p className="text-sm text-muted mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface shadow-card",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  accent?: string;
}) {
  return (
    <Card className="group px-3.5 py-2.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-blue/40 hover:shadow-card-hover">
      <div className="text-[10px] font-semibold text-muted uppercase tracking-[0.06em] truncate">
        {label}
      </div>
      <div
        className="mt-1 text-lg font-semibold tabular-nums truncate leading-tight tracking-tight"
        title={typeof value === "string" ? value : undefined}
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[10px] text-muted truncate">{hint}</div>}
    </Card>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="p-12 text-center">
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-muted max-w-md mx-auto">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </Card>
  );
}

/** Shown when Supabase env is missing — keeps every screen renderable. */
export function NotConfigured() {
  return (
    <EmptyState
      title="Supabase not configured"
      description="Add NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY to .env.local, then run the migration in supabase/migrations/0001_init.sql."
    />
  );
}

export function Button({
  href,
  children,
  variant = "primary",
  className,
  ...props
}: {
  href?: string;
  children: React.ReactNode;
  variant?: "primary" | "ghost" | "subtle";
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const variants = {
    // solid navy — matches the sidebar; flat, no gradient or glow
    primary:
      "bg-sidebar text-white hover:bg-[#1e293b] active:translate-y-px",
    ghost:
      "border border-border bg-surface text-foreground hover:bg-slate-50 hover:border-slate-300",
    // quiet inline action (links, View) — brand-cyan accent on a soft hover wash
    subtle:
      "text-[#1572a8] hover:bg-brand-blue/10 hover:text-[#106191]",
  } as const;
  const cls = cn(
    "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none",
    variants[variant],
    className,
  );
  if (href)
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  return (
    <button className={cls} {...props}>
      {children}
    </button>
  );
}
