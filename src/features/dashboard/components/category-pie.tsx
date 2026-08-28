"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/currency";
import { chartTooltipStyle } from "@/components/ui/chart-tooltip";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { CategoryDistributionDTO } from "@/types/dto";
import { useCategoryFilter } from "@/features/dashboard/use-category-filter";

export function CategoryPie({ data, title = "Distribuição por categoria" }: { data: CategoryDistributionDTO[]; title?: string }) {
  const { activeIds, toggle, clear } = useCategoryFilter();

  return (
    <Card elevation="sm" className={cn(data.length > 0 && "min-h-[320px]")}>
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
      {data.length === 0 ? (
        <p className="flex-1 text-sm opacity-60">Sem lançamentos no período.</p>
      ) : (
        <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto]">
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="total"
                  nameKey="categoryName"
                  innerRadius="55%"
                  outerRadius="85%"
                  paddingAngle={1}
                  onClick={(entry: unknown) => toggle((entry as CategoryDistributionDTO).categoryId)}
                  cursor="pointer"
                >
                  {data.map((entry) => (
                    <Cell
                      key={entry.categoryId}
                      fill={entry.color}
                      stroke="var(--color-bg)"
                      strokeWidth={1}
                      opacity={activeIds.length === 0 || activeIds.includes(entry.categoryId) ? 1 : 0.35}
                    />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(Number(value))} {...chartTooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="flex flex-col gap-1.5 text-xs">
            {data.slice(0, 8).map((entry) => {
              const active = activeIds.includes(entry.categoryId);
              return (
                <li
                  key={entry.categoryId}
                  className={`flex cursor-pointer items-center gap-1.5 ${activeIds.length > 0 && !active ? "opacity-40" : ""}`}
                  onClick={() => toggle(entry.categoryId)}
                >
                  <span className="size-2.5 shrink-0" style={{ background: entry.color }} />
                  <span className="flex-1 truncate">{entry.icon} {entry.categoryName}</span>
                  <span className="opacity-60 tabular-nums">{formatCurrency(entry.total)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}
