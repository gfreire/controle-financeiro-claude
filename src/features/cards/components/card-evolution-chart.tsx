"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardTitle } from "@/components/ui/card";
import { HelpHint } from "@/components/ui/help-hint";
import { formatCompactCurrency, formatCurrency } from "@/lib/utils/currency";
import { chartTooltipStyle } from "@/components/ui/chart-tooltip";
import { CategoryCheckboxFilter } from "@/components/ui/category-checkbox-filter";
import type { CardMonthlyEvolutionDTO, CategoryDTO } from "@/types/dto";
import { useEvolutionCategoryFilter } from "@/features/cards/use-evolution-category-filter";

/** 6 months before through 6 months after the viewed month (by installment competence),
 *  filterable by category — same additive multi-select interaction as the dashboard's category
 *  filter, but local to this chart and always EXPENSE-scoped (a card purchase is never anything
 *  else). With no category selected, bars show a single total per month; selecting one or more
 *  categories stacks each as its own colored segment (data.byCategory) instead of just narrowing
 *  the total, so the composition is visible, not just the sum. Respects whichever card the page's
 *  existing "Cartão" filter has narrowed to (or every card, if none). */
export function CardEvolutionChart({ data, categories }: { data: CardMonthlyEvolutionDTO[]; categories: CategoryDTO[] }) {
  const { activeIds, toggle, clear } = useEvolutionCategoryFilter();
  const expenseCategories = categories.filter((c) => c.type === "EXPENSE");
  const stacked = activeIds.length > 0;

  const { chartData, categoryMeta } = useMemo(() => {
    const meta = new Map<string, { name: string; color: string }>();
    const rows = data.map((row) => {
      const entry: Record<string, string | number> = { month: row.month, total: row.total, paid: row.paid, unpaid: row.unpaid };
      for (const c of row.byCategory) {
        entry[c.categoryId] = c.amount;
        if (!meta.has(c.categoryId)) meta.set(c.categoryId, { name: c.categoryName, color: c.color });
      }
      return entry;
    });
    return { chartData: rows, categoryMeta: meta };
  }, [data]);
  const categoryIds = [...categoryMeta.keys()];

  return (
    <Card elevation="sm" className="min-h-[320px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <CardTitle>Evolução mensal do cartão</CardTitle>
          <HelpHint id="cards.evolution" title="Evolução mensal do cartão">
            <p>Quanto foi faturado por mês (6 meses pra trás e pra frente), dividido em já pago (verde) e a pagar (vermelho).</p>
            <p>Com um filtro de categoria ativo, as barras passam a se dividir por categoria em vez de pago/a pagar.</p>
          </HelpHint>
        </div>
        <CategoryCheckboxFilter
          groups={[{ label: "Categorias", items: expenseCategories }]}
          activeIds={activeIds}
          onToggle={toggle}
          onClear={clear}
        />
      </div>
      {!stacked && (
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-text/60">
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2.5" style={{ background: "var(--color-success-500)" }} /> Pago
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2.5" style={{ background: "var(--color-danger-500)" }} /> Falta pagar
          </span>
        </div>
      )}
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--color-divider)" />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--color-text)" }} axisLine={{ stroke: "var(--color-divider)" }} tickLine={false} />
            <YAxis
              tickFormatter={(v) => formatCompactCurrency(v)}
              tick={{ fontSize: 11, fill: "var(--color-text)" }}
              axisLine={false}
              tickLine={false}
              width={64}
            />
            <Tooltip formatter={(value) => formatCurrency(Number(value))} {...chartTooltipStyle} />
            {stacked
              ? categoryIds.map((id) => (
                  <Bar key={id} dataKey={id} name={categoryMeta.get(id)!.name} stackId="cat" fill={categoryMeta.get(id)!.color} radius={[1, 1, 0, 0]} />
                ))
              : [
                  <Bar key="paid" dataKey="paid" name="Pago" stackId="pay" fill="var(--color-success-500)" radius={[0, 0, 0, 0]} />,
                  <Bar key="unpaid" dataKey="unpaid" name="Falta pagar" stackId="pay" fill="var(--color-danger-500)" radius={[1, 1, 0, 0]} />,
                ]}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
