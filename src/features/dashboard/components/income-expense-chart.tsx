"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardTitle } from "@/components/ui/card";
import { formatCompactCurrency, formatCurrency } from "@/lib/utils/currency";
import type { FinancialSummaryDTO } from "@/types/dto";

export function IncomeExpenseChart({ summary }: { summary: FinancialSummaryDTO }) {
  const data = [
    { label: "Receitas", value: summary.income, color: "var(--color-success-500)" },
    { label: "Despesas", value: summary.expense, color: "var(--color-danger-500)" },
  ];

  return (
    <Card elevation="sm" className="min-h-[320px]">
      <CardTitle>Receita vs. Despesa</CardTitle>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid horizontal={false} stroke="var(--color-divider)" />
            <XAxis type="number" tickFormatter={(v) => formatCompactCurrency(v)} tick={{ fontSize: 11, fill: "var(--color-text)" }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="label" tick={{ fontSize: 12, fill: "var(--color-text)" }} axisLine={false} tickLine={false} width={72} />
            <Tooltip
              formatter={(value) => formatCurrency(Number(value))}
              contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-divider)", borderRadius: 0, fontSize: 12 }}
            />
            <Bar dataKey="value" radius={[0, 1, 1, 0]}>
              {data.map((entry) => (
                <Cell key={entry.label} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
