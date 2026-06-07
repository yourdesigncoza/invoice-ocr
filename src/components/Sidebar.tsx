"use client";

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
  type LucideIcon,
} from "lucide-react";
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

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:w-60 md:flex-col bg-sidebar text-slate-300 shrink-0">
      <div className="flex items-center gap-2 px-5 h-16 border-b border-white/10">
        <Receipt className="h-5 w-5 text-accent" />
        <span className="font-semibold text-white tracking-tight">InvoiceIQ</span>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map((item) => {
          const Icon = ICONS[item.icon] ?? Receipt;
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
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
      </nav>
      <div className="px-5 py-4 text-xs text-slate-500 border-t border-white/10">
        Supplier spend intelligence
      </div>
    </aside>
  );
}
