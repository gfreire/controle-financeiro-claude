import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils/currency";
import { toPercentage } from "@/lib/utils/number";
import type { ReactNode } from "react";

/** Shared planned-vs-actual bar, used by both the /budgets page tree and the dashboard panel. */
export function ProgressRow({
  label,
  planned,
  actual,
  status,
  meta,
  indent,
  actions,
}: {
  label: string;
  planned: number;
  actual: number;
  status: "OK" | "EXCEEDED";
  meta?: string;
  indent?: boolean;
  actions?: ReactNode;
}) {
  const pct = toPercentage(actual, planned);
  return (
    <div className={`flex flex-col gap-1 ${indent ? "ml-4 border-l border-divider pl-3" : ""}`}>
      <div className="flex items-center justify-between text-[13px]">
        <span className="flex items-center gap-1.5">
          {label}
          {meta && <span className="text-[11px] opacity-50">{meta}</span>}
        </span>
        <span className="flex items-center gap-2">
          <span className="tabular-nums opacity-80">
            {formatCurrency(actual)} / {formatCurrency(planned)}
          </span>
          {actions}
        </span>
      </div>
      <div className="h-1.5 w-full bg-neutral-200">
        <div
          className={status === "EXCEEDED" ? "h-full bg-danger-500" : "h-full bg-accent"}
          style={{ width: `${pct}%` }}
        />
      </div>
      {status === "EXCEEDED" && (
        <Badge variant="danger" className="w-fit">Estourou o orçamento</Badge>
      )}
    </div>
  );
}
