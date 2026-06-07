"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Upload,
  ClipboardCheck,
  Table2,
  Building2,
  CopyCheck,
  FileBarChart,
  Download,
  Receipt,
  Menu,
  X,
  LogOut,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import { NAV } from "@/lib/constants";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  Upload,
  ClipboardCheck,
  Table2,
  Building2,
  CopyCheck,
  FileBarChart,
  Download,
  ShieldCheck,
};

const Wordmark = () => (
  <div className="flex items-center gap-2.5">
    <Image
      src="/spendsilo_mark.png"
      alt="SpendSilo"
      width={33}
      height={36}
      priority
      className="h-9 w-auto"
    />
    <span className="font-bold text-white tracking-tight text-xl">SpendSilo</span>
  </div>
);

/** Shared nav list — single source of truth for both desktop rail and mobile drawer. */
function NavLinks({
  onNavigate,
  isAdmin,
}: {
  onNavigate?: () => void;
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const items = isAdmin
    ? [...NAV, { href: "/admin", label: "Admin", icon: "ShieldCheck" } as const]
    : NAV;
  return (
    <>
      {items.map((item) => {
        const Icon = ICONS[item.icon] ?? Receipt;
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              active
                ? "bg-white/10 text-white"
                : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

/** Signed-in account row + sign-out, shared by rail and drawer. */
function AccountFooter({
  email,
  onSignOut,
}: {
  email: string;
  onSignOut: () => void;
}) {
  return (
    <div className="border-t border-white/10 px-3 py-3">
      {email && (
        <div className="px-2 pb-2 text-xs text-slate-500 truncate" title={email}>
          {email}
        </div>
      )}
      <button
        type="button"
        onClick={onSignOut}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
      >
        <LogOut className="h-4 w-4 shrink-0" /> Sign out
      </button>
    </div>
  );
}

export function Sidebar({ email, isAdmin }: { email: string; isAdmin?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // close the drawer whenever the route changes
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  async function signOut() {
    await getBrowserSupabase()?.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {/* DESKTOP rail */}
      <aside className="hidden md:flex md:w-60 md:flex-col bg-sidebar text-slate-300 shrink-0">
        <div className="px-5 py-6 border-b border-white/10">
          <Wordmark />
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          <NavLinks isAdmin={isAdmin} />
        </nav>
        <AccountFooter email={email} onSignOut={signOut} />
      </aside>

      {/* MOBILE top bar */}
      <header className="md:hidden shrink-0 flex items-center justify-between bg-sidebar px-4 h-14">
        <Link href="/dashboard">
          <Wordmark />
        </Link>
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="p-2 -mr-2 text-slate-300 hover:text-white"
        >
          <Menu className="h-6 w-6" />
        </button>
      </header>

      {/* MOBILE drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-64 max-w-[80%] flex flex-col bg-sidebar text-slate-300 shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <Wordmark />
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="p-2 -mr-2 text-slate-300 hover:text-white"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              <NavLinks onNavigate={() => setOpen(false)} isAdmin={isAdmin} />
            </nav>
            <AccountFooter email={email} onSignOut={signOut} />
          </aside>
        </div>
      )}
    </>
  );
}
