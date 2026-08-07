"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardTitle } from "@/components/ui/card";
import { formatCompactCurrency, formatCurrency } from "@/lib/utils/currency";
import type { CategoryComparisonDTO } from "@/types/dto";

export function CategoryBars({ data }: { data: CategoryComparisonDTO[] }) {
  const chartData = data.slice(0, 10).reverse();

  return (
    <Card elevation="sm" className="min-h-[320px]">
      <CardTitle>Comparativo por categoria</CardTitle>
      {chartData.length === 0 ? (
        <p className="flex-1 text-sm opacity-60">Sem lançamentos no período.</p>
      ) : (
        <div style={{ height: Math.max(chartData.length * 32, 160) }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid horizontal={false} stroke="var(--color-divider)" />
              <XAxis type="number" tickFormatter={(v) => formatCompactCurrency(v)} tick={{ fontSize: 11, fill: "var(--color-text)" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="categoryName" tick={{ fontSize: 11, fill: "var(--color-text)" }} axisLine={false} tickLine={false} width={110} />
              <Tooltip
                formatter={(value) => formatCurrency(Number(value))}
                contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-divider)", borderRadius: 0, fontSize: 12 }}
              />
              <Bar dataKey="total" fill="var(--color-accent)" radius={[0, 1, 1, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
