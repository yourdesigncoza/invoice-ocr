import { Sidebar } from "@/components/Sidebar";
import { UploadNotificationsProvider } from "@/components/UploadNotifications";
import InstallPrompt from "@/components/InstallPrompt";
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
          {/* extra bottom padding on mobile so the floating install banner
              never covers the last rows of content */}
          <div className="mx-auto max-w-7xl px-6 pt-8 pb-28 md:pb-8">
            {children}
          </div>
        </main>
        {/* mobile-only floating "Add to Home Screen" banner */}
        <InstallPrompt />
      </div>
    </UploadNotificationsProvider>
  );
}
