import { requireAdmin } from "@/lib/auth-guards";
import { createAdminSupabase } from "@/lib/supabase/server";
import { PageHeader, NotConfigured } from "@/components/ui";
import { AdminUsersClient, type AdminUser } from "@/components/AdminUsersClient";
import { isSupabaseConfigured } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const admin = await requireAdmin(); // non-admins → /dashboard

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title="Admin" />
        <NotConfigured />
      </>
    );
  }

  const supabase = createAdminSupabase()!;
  const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const users: AdminUser[] = (data?.users ?? [])
    .map((u) => ({
      id: u.id,
      email: u.email ?? "(no email)",
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      confirmed: Boolean(u.email_confirmed_at ?? u.confirmed_at),
    }))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1)); // newest first

  return (
    <>
      <PageHeader
        title="Admin"
        subtitle={`${users.length} user account(s) — manage logins only, not their invoices`}
      />
      <AdminUsersClient users={users} currentUserId={admin.id} />
    </>
  );
}
