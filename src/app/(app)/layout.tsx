import { Sidebar } from "@/components/Sidebar";
import { UploadNotificationsProvider } from "@/components/UploadNotifications";
import { requireUser, isAdminEmail } from "@/lib/auth-guards";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // belt-and-braces: proxy already redirects, but gate the layout too
  const user = await requireUser();

  return (
    <UploadNotificationsProvider>
      <div className="flex flex-col md:flex-row h-screen overflow-hidden">
        <Sidebar email={user.email ?? ""} isAdmin={isAdminEmail(user.email)} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-6 py-8">{children}</div>
        </main>
      </div>
    </UploadNotificationsProvider>
  );
}
