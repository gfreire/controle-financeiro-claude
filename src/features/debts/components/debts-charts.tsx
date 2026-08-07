"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/currency";
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

function DebtPie({ title, debts, shades }: { title: string; debts: DebtDTO[]; shades: string[] }) {
  const data = debts.map((d) => ({ name: d.agent, value: d.remainingBalance }));

  return (
    <Card elevation="sm" className="min-h-[260px]">
      <CardTitle>{title}</CardTitle>
      <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto]">
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={1}>
                {data.map((entry, i) => (
                  <Cell key={entry.name} fill={shades[i % shades.length]} stroke="var(--color-bg)" strokeWidth={1} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => formatCurrency(Number(value))}
                contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-divider)", borderRadius: 0, fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="flex flex-col gap-1.5 text-xs">
          {data.map((entry, i) => (
            <li key={entry.name} className="flex items-center gap-1.5">
              <span className="size-2.5 shrink-0" style={{ background: shades[i % shades.length] }} />
              <span className="flex-1 truncate">{entry.name}</span>
              <span className="opacity-60 tabular-nums">{formatCurrency(entry.value)}</span>
            </li>
          ))}
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
 */
export function DebtsCharts({ debts }: { debts: DebtDTO[] }) {
  const payable = debts.filter((d) => d.side === "PAYABLE" && d.remainingBalance > 0);
  const receivable = debts.filter((d) => d.side === "RECEIVABLE" && d.remainingBalance > 0);

  if (payable.length === 0 && receivable.length === 0) return null;

  const bothSides = payable.length > 0 && receivable.length > 0;

  return (
    <div className={`grid grid-cols-1 gap-4 ${bothSides ? "sm:grid-cols-2" : ""}`}>
      {payable.length > 0 && <DebtPie title="Dívidas a pagar" debts={payable} shades={PAYABLE_SHADES} />}
      {receivable.length > 0 && <DebtPie title="Dívidas a receber" debts={receivable} shades={RECEIVABLE_SHADES} />}
    </div>
  );
}
