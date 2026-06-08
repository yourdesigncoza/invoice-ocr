import { cn } from "@/lib/utils";
import type { PaymentStatus } from "@/lib/constants";

/**
 * Compact Paid / Unpaid pill for the register. Only renders for the two
 * settled-state values; COD / Account / Unknown / null show a muted dash so the
 * column stays quiet until a reviewer has made a call.
 */
export function PaidBadge({ status }: { status: PaymentStatus | null }) {
  if (status !== "Paid" && status !== "Unpaid")
    return <span className="text-muted">—</span>;
  const paid = status === "Paid";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        paid
          ? "text-status-approved bg-status-approved/10 ring-status-approved/20"
          : "text-status-review bg-status-review/10 ring-status-review/20",
      )}
    >
      {paid ? "Paid" : "Unpaid"}
    </span>
  );
}
