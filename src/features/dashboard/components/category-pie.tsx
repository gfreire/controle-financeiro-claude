"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/currency";
import { toPercentage } from "@/lib/utils/number";
import type { CategoryDistributionDTO } from "@/types/dto";

export function CategoryPie({ data }: { data: CategoryDistributionDTO[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const total = data.reduce((sum, d) => sum + d.total, 0);

  function handleClick(categoryId: string) {
    const params = new URLSearchParams(searchParams.toString());
    const current = params.get("categories");
    if (current === categoryId) params.delete("categories");
    else params.set("categories", categoryId);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Card elevation="sm" className="min-h-[320px]">
      <CardTitle>Distribuição por categoria</CardTitle>
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
                  onClick={(entry: unknown) => handleClick((entry as CategoryDistributionDTO).categoryId)}
                  cursor="pointer"
                >
                  {data.map((entry) => (
                    <Cell key={entry.categoryId} fill={entry.color} stroke="var(--color-bg)" strokeWidth={1} />
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
            {data.slice(0, 8).map((entry) => (
              <li key={entry.categoryId} className="flex cursor-pointer items-center gap-1.5" onClick={() => handleClick(entry.categoryId)}>
                <span className="size-2.5 shrink-0" style={{ background: entry.color }} />
                <span className="flex-1 truncate">{entry.icon} {entry.categoryName}</span>
                <span className="opacity-60">{toPercentage(entry.total, total)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
