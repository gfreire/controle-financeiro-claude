"use client";

import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/currency";
import { chartTooltipStyle } from "@/components/ui/chart-tooltip";
import type { DebtDTO } from "@/types/dto";

const PAYABLE_SHADES = [
  "var(--color-danger-600)",
  "var(--color-danger-500)",
  "var(--color-danger-300)",
  "var(--color-danger-700)",
  "var(--color-danger-800)",
];
const RECEIVABLE_SHADES = [
  "var(--color-success-600)",
  "var(--color-success-500)",
  "var(--color-success-300)",
  "var(--color-success-700)",
  "var(--color-success-800)",
];

function DebtPie({
  title,
  debts,
  shades,
  disabledIds,
  onToggle,
}: {
  title: string;
  debts: DebtDTO[];
  shades: string[];
  disabledIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  const active = debts.filter((d) => !disabledIds.has(d.id));
  const total = active.reduce((sum, d) => sum + d.remainingBalance, 0);
  const data = active.map((d) => ({ id: d.id, name: d.agent, value: d.remainingBalance }));

  return (
    <Card elevation="sm" className="min-h-[260px]">
      <CardTitle>{title}</CardTitle>
      <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto]">
        <div className="relative h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius="55%"
                outerRadius="85%"
                paddingAngle={1}
                onClick={(_, index) => onToggle(data[index].id)}
                cursor="pointer"
              >
                {data.map((entry, i) => {
                  const originalIndex = debts.findIndex((d) => d.id === entry.id);
                  return (
                    <Cell
                      key={entry.id}
                      fill={shades[originalIndex % shades.length]}
                      stroke="var(--color-bg)"
                      strokeWidth={1}
                    />
                  );
                })}
              </Pie>
              <Tooltip formatter={(value) => formatCurrency(Number(value))} {...chartTooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[10px] uppercase tracking-wide opacity-60">Total</span>
            <span className="text-sm font-semibold tabular-nums">{formatCurrency(total)}</span>
          </div>
        </div>
        <ul className="flex flex-col gap-1.5 text-xs">
          {debts.map((d, i) => {
            const disabled = disabledIds.has(d.id);
            return (
              <li
                key={d.id}
                onClick={() => onToggle(d.id)}
                className={`flex cursor-pointer items-center gap-1.5 select-none ${disabled ? "opacity-40" : ""}`}
              >
                <span
                  className="size-2.5 shrink-0"
                  style={{ background: disabled ? "var(--color-divider)" : shades[i % shades.length] }}
                />
                <span className={`flex-1 truncate ${disabled ? "line-through" : ""}`}>{d.agent}</span>
                <span className="opacity-60 tabular-nums">{formatCurrency(d.remainingBalance)}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}

/**
 * Two simple pies (a pagar / a receber) so the Dívidas page opens with an at-a-glance read,
 * not just a list. Each side only renders if it actually has an active debt with balance —
 * per the "soft-delete on zero" rule (AI_CONTEXT.md "Dívidas"), a settled debt already drops
 * out of `getDebts()`, so this is mostly a guard against an empty/all-zero side.
 *
 * Clicking a debt (slice or legend row) toggles it out of the chart/total — purely a local
 * view-state affordance for isolating a subset visually, not a data mutation.
 */
export function DebtsCharts({ debts }: { debts: DebtDTO[] }) {
  const [disabledIds, setDisabledIds] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setDisabledIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const payable = debts.filter((d) => d.side === "PAYABLE" && d.remainingBalance > 0);
  const receivable = debts.filter((d) => d.side === "RECEIVABLE" && d.remainingBalance > 0);

  if (payable.length === 0 && receivable.length === 0) return null;

  const bothSides = payable.length > 0 && receivable.length > 0;

  return (
    <div className={`grid grid-cols-1 gap-4 ${bothSides ? "sm:grid-cols-2" : ""}`}>
      {payable.length > 0 && (
        <DebtPie title="Dívidas a pagar" debts={payable} shades={PAYABLE_SHADES} disabledIds={disabledIds} onToggle={toggle} />
      )}
      {receivable.length > 0 && (
        <DebtPie title="Dívidas a receber" debts={receivable} shades={RECEIVABLE_SHADES} disabledIds={disabledIds} onToggle={toggle} />
      )}
    </div>
  );
}
