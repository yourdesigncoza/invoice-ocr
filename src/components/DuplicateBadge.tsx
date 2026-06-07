import { Copy } from "lucide-react";

/**
 * System-detected duplicate flag — shown next to an invoice's status wherever
 * it's listed when `duplicate_checks` exist for it. Not a status the user sets;
 * the reviewer opens the record and decides to accept or delete it.
 */
export function DuplicateBadge({ count }: { count?: number }) {
  if (!count) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap text-status-duplicate"
      style={{ backgroundColor: "#fff7ed", boxShadow: "inset 0 0 0 1px #ea580c26" }}
      title="Possible duplicate of an existing invoice"
    >
      <Copy className="h-3 w-3" />
      Possible duplicate
    </span>
  );
}
