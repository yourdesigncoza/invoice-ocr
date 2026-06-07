import { requireUser } from "@/lib/auth-guards";
import { getProjects, isSupabaseConfigured } from "@/lib/data";
import { PageHeader, NotConfigured } from "@/components/ui";
import { SitesManager } from "@/components/SitesManager";
import { AccountCard } from "@/components/AccountCard";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title="Settings" />
        <NotConfigured />
      </>
    );
  }

  const projects = await getProjects();

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Manage your sites and account"
      />

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold text-foreground">Sites</h2>
        <p className="mb-3 text-xs text-muted max-w-xl">
          A site is a place you spend at — a construction project, a shop outlet,
          a branch. Tag invoices by site to see what each one costs. The picker
          appears across the app once you have 2 or more.
        </p>
        <SitesManager projects={projects} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">Account</h2>
        <AccountCard email={user.email ?? ""} />
      </section>
    </>
  );
}
