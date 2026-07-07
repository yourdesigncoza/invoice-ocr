import Link from "next/link";
import {
  Settings,
  Upload,
  ScanLine,
  ClipboardCheck,
  CopyCheck,
  Building2,
  FileBarChart,
  Download,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  Split,
  type LucideIcon,
} from "lucide-react";
import { PageHeader, Card } from "@/components/ui";
import { cn } from "@/lib/utils";

// A plain-language, first-run walkthrough. It mirrors the real pipeline:
// set preferences → upload → auto-extract → review side-by-side → approve.
// Kept deliberately non-technical — this is the only screen written for a
// brand-new user, not an operator.

type Step = {
  icon: LucideIcon;
  title: string;
  body: string;
  href?: string;
  cta?: string;
};

const STEPS: Step[] = [
  {
    icon: Settings,
    title: "Set up your preferences (one minute)",
    body: "Open Settings and pick your default currency (South African Rand by default). If you spend across more than one place — a building project, a shop, a branch — add them as “Sites” here too. Everything else works out of the box.",
    href: "/settings",
    cta: "Open Settings",
  },
  {
    icon: Upload,
    title: "Upload your first invoice",
    body: "Go to Upload and drop in a photo or PDF — a phone snap of a till slip, a scanned tax invoice, a WhatsApp photo. You can add several at once. Crooked or slightly blurry is fine; clearer is better.",
    href: "/upload",
    cta: "Upload an invoice",
  },
  {
    icon: ScanLine,
    title: "Let it read the invoice",
    body: "The moment a file lands, it reads the supplier, date, totals, VAT and line items for you — no typing. This takes a few seconds per document. You don’t have to wait on this screen; it keeps working in the background.",
  },
  {
    icon: ClipboardCheck,
    title: "Check and approve",
    body: "Nothing is trusted until you say so. The Review Queue shows the original image on the left and the captured details on the right, side by side. Fix anything that looks off, tick “Paid” if it’s settled, then Approve. Only approved invoices count in your reports.",
    href: "/review",
    cta: "Open the Review Queue",
  },
];

type Concept = {
  icon: LucideIcon;
  title: string;
  body: string;
  href?: string;
  cta?: string;
};

const CONCEPTS: Concept[] = [
  {
    icon: Building2,
    title: "Suppliers are grouped automatically",
    body: "The same shop often appears under slightly different names (“SPAR”, “Hartenbos Spar & Tops”). They’re pulled together into one supplier so your spend per supplier is accurate — even across branches.",
    href: "/suppliers",
    cta: "View suppliers",
  },
  {
    icon: CopyCheck,
    title: "Duplicates are caught for you",
    body: "If you upload the same invoice twice, it gets flagged with an orange badge before you approve it. You decide: approve the real one, delete the copy. There’s no button you need to press to make this happen.",
    href: "/duplicates",
    cta: "View duplicates",
  },
  {
    icon: Split,
    title: "One receipt, two sites? Split it",
    body: "Bought for two jobs in one trip? On the review screen, tag the line items that belong to the other site and the total is divided between the sites automatically — no calculator needed. Untagged lines stay with the invoice’s main site. (You’ll see this once you have two or more sites.)",
    href: "/review",
    cta: "Open the Review Queue",
  },
  {
    icon: FileBarChart,
    title: "See where the money goes",
    body: "Once you’ve approved a few invoices, the Dashboard and Reports show spend by supplier and over time — day, week, month, quarter or year. Filter by site if you’ve added them.",
    href: "/reports",
    cta: "Open Reports",
  },
  {
    icon: Download,
    title: "Take your data anywhere",
    body: "Export clean invoice data to CSV for Excel or your bookkeeper at any time. Nothing is locked in.",
    href: "/exports",
    cta: "Open Exports",
  },
];

export default function GettingStartedPage() {
  return (
    <>
      <PageHeader
        title="Getting started"
        subtitle="A quick tour of how SpendSilo turns a pile of invoices into clear spend"
      />

      {/* Welcome banner */}
      <Card className="mb-8 overflow-hidden">
        <div className="flex items-start gap-4 p-5 sm:p-6">
          <div className="hidden sm:flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 text-brand-blue">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Welcome 👋
            </h2>
            <p className="mt-1 text-sm text-muted max-w-2xl">
              SpendSilo reads your invoices and receipts for you, then asks you
              to give each one a quick check before it’s counted. Follow the four
              steps below and you’ll have your first approved invoice in a couple
              of minutes.
            </p>
          </div>
        </div>
      </Card>

      {/* The four core steps */}
      <h2 className="mb-3 text-sm font-semibold text-foreground">
        Four steps to your first approved invoice
      </h2>
      <ol className="space-y-3">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          return (
            <li key={step.title}>
              <Card className="flex items-start gap-4 p-4 sm:p-5">
                {/* number + icon */}
                <div className="flex shrink-0 flex-col items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sidebar text-xs font-semibold text-white">
                    {i + 1}
                  </span>
                  <Icon className="h-4 w-4 text-muted" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-foreground">
                    {step.title}
                  </h3>
                  <p className="mt-1 text-sm text-muted">{step.body}</p>
                  {step.href && step.cta && (
                    <Link
                      href={step.href}
                      className="mt-2.5 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                    >
                      {step.cta}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ol>

      {/* Good-to-know concepts */}
      <h2 className="mt-10 mb-3 text-sm font-semibold text-foreground">
        Good to know
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {CONCEPTS.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.title} className="p-4 sm:p-5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-muted">
                  <Icon className="h-4 w-4" />
                </span>
                <h3 className="text-sm font-semibold text-foreground">
                  {c.title}
                </h3>
              </div>
              <p className="mt-2 text-sm text-muted">{c.body}</p>
              {c.href && c.cta && (
                <Link
                  href={c.href}
                  className="mt-2.5 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  {c.cta}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </Card>
          );
        })}
      </div>

      {/* Trust / privacy note + a couple of quick tips */}
      <Card className="mt-8 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 shrink-0 text-brand-green" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Your invoices are yours
            </h3>
            <p className="mt-1 text-sm text-muted max-w-2xl">
              Your invoices, suppliers and reports are private to your account —
              nobody else using SpendSilo can see them. Approved records are
              never silently deleted, and every correction you make is kept on
              record.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-x-6 gap-y-2 text-sm text-muted sm:grid-cols-2">
          <Tip>
            VAT missing on a slip? That’s normal for till receipts — it’s flagged
            for you, not treated as an error.
          </Tip>
          <Tip>
            Install SpendSilo on your phone’s home screen to snap and upload
            invoices on the go.
          </Tip>
          <Tip>
            A red “Low confidence” badge just means the photo was hard to read —
            give it an extra look before approving.
          </Tip>
          <Tip>
            Stuck on something? The{" "}
            <Link href="/dashboard" className="text-primary hover:underline">
              Dashboard
            </Link>{" "}
            is always your home base.
          </Tip>
        </div>
      </Card>

      {/* Primary call to action */}
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link
          href="/upload"
          className="inline-flex items-center gap-2 rounded-lg bg-sidebar px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1e293b] active:translate-y-px"
        >
          <Upload className="h-4 w-4" />
          Upload your first invoice
        </Link>
        <Link
          href="/settings"
          className="text-sm font-medium text-primary hover:underline"
        >
          Set up preferences first
        </Link>
      </div>
    </>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className={cn("flex items-start gap-2")}>
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blue/60" />
      <span>{children}</span>
    </div>
  );
}
