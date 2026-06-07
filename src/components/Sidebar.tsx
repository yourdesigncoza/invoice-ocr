"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import { NAV } from "@/lib/constants";
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
function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <>
      {NAV.map((item) => {
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

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // close the drawer whenever the route changes
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      {/* DESKTOP rail */}
      <aside className="hidden md:flex md:w-60 md:flex-col bg-sidebar text-slate-300 shrink-0">
        <div className="px-5 py-6 border-b border-white/10">
          <Wordmark />
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          <NavLinks />
        </nav>
        <div className="px-5 py-4 text-xs text-slate-500 border-t border-white/10">
          Supplier spend intelligence
        </div>
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
              <NavLinks onNavigate={() => setOpen(false)} />
            </nav>
          </aside>
        </div>
      )}
    </>
  );
}
