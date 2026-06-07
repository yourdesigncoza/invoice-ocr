import { confidenceColor, formatPct } from "@/lib/utils";

export function ConfidenceBadge({ score }: { score: number | null | undefined }) {
  const color = confidenceColor(score);
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium tabular-nums"
      style={{ color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {formatPct(score)}
    </span>
  );
}
