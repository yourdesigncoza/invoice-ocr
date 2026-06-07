import Link from "next/link";
import {
  getInvoices,
  getActiveProjects,
  isSupabaseConfigured,
  type InvoiceFilters,
} from "@/lib/data";
import { rangeFor } from "@/lib/periods";
import { PageHeader, NotConfigured, Button } from "@/components/ui";
import { InvoiceTable } from "@/components/InvoiceTable";
import { SiteFilter } from "@/components/SiteFilter";
import { cn } from "@/lib/utils";
import type { InvoiceStatus } from "@/lib/constants";

export const dynamic = "force-dynamic";

// Register views (PRD §7.6). Each maps to a filter set.
const VIEWS: { key: string; label: string; filters: () => InvoiceFilters }[] = [
  { key: "all", label: "All Invoices", filters: () => ({}) },
  { key: "needs_review", label: "Needs Review", filters: () => ({ status: "needs_review" }) },
  { key: "approved", label: "Approved", filters: () => ({ status: "approved" }) },
  { key: "low_confidence", label: "Low Confidence", filters: () => ({ status: "low_confidence" }) },
  { key: "this_week", label: "This Week", filters: () => ({ ...rangeFor("this_week", new Date()) }) },
  { key: "this_month", label: "This Month", filters: () => ({ ...rangeFor("this_month", new Date()) }) },
  { key: "rejected", label: "Rejected", filters: () => ({ status: "rejected" as InvoiceStatus }) },
];

export default async function InvoicesPage(props: PageProps<"/invoices">) {
  const sp = await props.searchParams;
  const viewKey = typeof sp.view === "string" ? sp.view : "all";
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const projectId = typeof sp.project === "string" ? sp.project : undefined;

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title="Invoices" />
        <NotConfigured />
      </>
    );
  }

  const view = VIEWS.find((v) => v.key === viewKey) ?? VIEWS[0];
  const activeProjects = await getActiveProjects();
  const sitesEnabled = activeProjects.length >= 2;
  const invoices = await getInvoices({
    ...view.filters(),
    search: q,
    projectId: sitesEnabled ? projectId : undefined,
    limit: 300,
  });

  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle={`${invoices.length} record(s)`}
        action={
          <Button href="/exports" variant="ghost">
            Export
          </Button>
        }
      />

      <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={`/invoices?view=${v.key}${q ? `&q=${encodeURIComponent(q)}` : ""}${projectId ? `&project=${projectId}` : ""}`}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
              v.key === view.key
                ? "bg-foreground text-white"
                : "text-muted hover:bg-slate-100",
            )}
          >
            {v.label}
          </Link>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form action="/invoices">
          <input type="hidden" name="view" value={view.key} />
          {projectId && <input type="hidden" name="project" value={projectId} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="Search supplier or invoice number…"
            className="w-full max-w-md rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </form>
        {sitesEnabled && (
          <SiteFilter
            projects={activeProjects}
            current={projectId ?? ""}
            view={view.key}
            q={q}
          />
        )}
      </div>

      <InvoiceTable
        invoices={invoices}
        showProject={sitesEnabled}
        projects={sitesEnabled ? activeProjects : []}
      />
    </>
  );
}
