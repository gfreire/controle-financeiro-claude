"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatCurrency } from "@/lib/utils/currency";
import { chartTooltipStyle } from "@/components/ui/chart-tooltip";

export type DonutEntry = { id: string; name: string; value: number; color: string };

/** Shared "value in the middle, legend beside" donut shape used by every summary donut in the app (Accounts' balance/limit-used pair, Cards' per-card monthly spend). */
export function DonutWithTotal({
  data,
  total,
  centerLabel,
  centerSubLabel,
  emptyMessage,
}: {
  data: DonutEntry[];
  total: number;
  centerLabel: string;
  centerSubLabel?: string;
  emptyMessage: string;
}) {
  if (data.length === 0 || total <= 0) {
    return <p className="flex-1 text-sm opacity-60">{emptyMessage}</p>;
  }

  return (
    <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto]">
      <div className="relative h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="60%" outerRadius="85%" paddingAngle={1}>
              {data.map((entry) => (
                <Cell key={entry.id} fill={entry.color} stroke="var(--color-bg)" strokeWidth={1} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => formatCurrency(Number(value))} {...chartTooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-semibold tabular-nums">{centerLabel}</span>
          {centerSubLabel && <span className="text-[11px] opacity-60">{centerSubLabel}</span>}
        </div>
      </div>
      <ul className="flex flex-col gap-1.5 text-xs">
        {data.map((entry) => (
          <li key={entry.id} className="flex items-center gap-1.5">
            <span className="size-2.5 shrink-0" style={{ background: entry.color }} />
            <span className="flex-1 truncate">{entry.name}</span>
            <span className="opacity-60 tabular-nums">{formatCurrency(entry.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
