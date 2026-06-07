import { STATUS_META, type InvoiceStatus } from "@/lib/constants";

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.processing;
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ color: meta.color, backgroundColor: meta.bg }}
    >
      <span
        className="mr-1.5 h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: meta.color }}
      />
      {meta.label}
    </span>
  );
}
