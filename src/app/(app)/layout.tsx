import { Sidebar } from "@/components/Sidebar";
import { UploadNotificationsProvider } from "@/components/UploadNotifications";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <UploadNotificationsProvider>
      <div className="flex flex-col md:flex-row h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-6 py-8">{children}</div>
        </main>
      </div>
    </UploadNotificationsProvider>
  );
}
