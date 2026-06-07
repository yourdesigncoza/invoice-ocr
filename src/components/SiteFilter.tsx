"use client";

import { useRouter } from "next/navigation";
import type { Project } from "@/lib/types";

/** Site/project dropdown for the invoice register — navigates on change. */
export function SiteFilter({
  projects,
  current,
  view,
  q,
}: {
  projects: Project[];
  current: string;
  view: string;
  q?: string;
}) {
  const router = useRouter();
  return (
    <select
      value={current}
      onChange={(e) => {
        const params = new URLSearchParams();
        params.set("view", view);
        if (q) params.set("q", q);
        if (e.target.value) params.set("project", e.target.value);
        router.push(`/invoices?${params.toString()}`);
      }}
      className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
    >
      <option value="">All sites</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
