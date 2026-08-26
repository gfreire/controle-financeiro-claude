"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardTitle } from "@/components/ui/card";
import { formatCompactCurrency, formatCurrency } from "@/lib/utils/currency";
import { chartTooltipStyle } from "@/components/ui/chart-tooltip";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { CategoryComparisonDTO } from "@/types/dto";
import { useCategoryFilter } from "@/features/dashboard/use-category-filter";

/**
 * Same underlying data as CategoryPie (getCategoryComparison is just getCategoryDistribution
 * minus `icon`) — kept clickable in the same additive/multi-select way, so the donut and the
 * comparative bars never disagree about what "clicking a category" does.
 */
export function CategoryBars({ data, title = "Comparativo por categoria" }: { data: CategoryComparisonDTO[]; title?: string }) {
  const { activeIds, toggle, clear } = useCategoryFilter();
  const chartData = data.slice(0, 10).reverse();

  return (
    <Card elevation="sm" className={cn(chartData.length > 0 && "min-h-[320px]")}>
      <div className="flex items-center gap-2">
        {activeIds.length > 0 && (
          <button
            type="button"
            onClick={clear}
            className="flex items-center gap-1 p-1.5 -m-1.5 text-text/50 hover:text-accent"
            aria-label="Limpar filtro de categoria"
          >
            <ArrowLeft className="size-4" strokeWidth={1.5} />
          </button>
        )}
        <CardTitle>{title}</CardTitle>
      </div>
      {chartData.length === 0 ? (
        <p className="flex-1 text-sm opacity-60">Sem lançamentos no período.</p>
      ) : (
        <div style={{ height: Math.max(chartData.length * 32, 160) }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid horizontal={false} stroke="var(--color-divider)" />
              <XAxis type="number" tickFormatter={(v) => formatCompactCurrency(v)} tick={{ fontSize: 11, fill: "var(--color-text)" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="categoryName" tick={{ fontSize: 11, fill: "var(--color-text)" }} axisLine={false} tickLine={false} width={110} />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} {...chartTooltipStyle} />
              <Bar dataKey="total" radius={[0, 1, 1, 0]} onClick={(entry: unknown) => toggle((entry as CategoryComparisonDTO).categoryId)} cursor="pointer">
                {chartData.map((entry) => (
                  <Cell
                    key={entry.categoryId}
                    fill={entry.color}
                    opacity={activeIds.length === 0 || activeIds.includes(entry.categoryId) ? 1 : 0.35}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
