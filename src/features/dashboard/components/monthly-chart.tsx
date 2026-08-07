"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardTitle } from "@/components/ui/card";
import { formatCompactCurrency, formatCurrency } from "@/lib/utils/currency";
import type { MonthlyEvolutionDTO } from "@/types/dto";

export function MonthlyChart({ data }: { data: MonthlyEvolutionDTO[] }) {
  return (
    <Card elevation="sm" className="min-h-[320px]">
      <CardTitle>Evolução mensal</CardTitle>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--color-divider)" />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--color-text)" }} axisLine={{ stroke: "var(--color-divider)" }} tickLine={false} />
            <YAxis
              tickFormatter={(v) => formatCompactCurrency(v)}
              tick={{ fontSize: 11, fill: "var(--color-text)" }}
              axisLine={false}
              tickLine={false}
              width={64}
            />
            <Tooltip
              formatter={(value) => formatCurrency(Number(value))}
              contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-divider)", borderRadius: 0, fontSize: 12 }}
            />
            <Bar dataKey="income" name="Receitas" fill="var(--color-success-500)" radius={[1, 1, 0, 0]} />
            <Bar dataKey="expense" name="Despesas" fill="var(--color-danger-500)" radius={[1, 1, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
