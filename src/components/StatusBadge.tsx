import { STATUS_META, type InvoiceStatus } from "@/lib/constants";

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.processing;
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{
        color: meta.color,
        backgroundColor: meta.bg,
        // crisp Airtable-style hairline in the status colour, very low opacity
        boxShadow: `inset 0 0 0 1px ${meta.color}26`,
      }}
    >
      {meta.label}
    </span>
  );
}
