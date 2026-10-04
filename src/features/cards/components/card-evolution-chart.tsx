"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardTitle } from "@/components/ui/card";
import { HelpHint } from "@/components/ui/help-hint";
import { formatCompactCurrency, formatCurrency } from "@/lib/utils/currency";
import { chartTooltipStyle } from "@/components/ui/chart-tooltip";
import { CategoryCheckboxFilter } from "@/components/ui/category-checkbox-filter";
import { compactMonth, MonthLabelsOverlay, useResponsiveLabelFont } from "@/components/ui/chart-month-labels";
import type { CardMonthlyEvolutionDTO, CategoryDTO } from "@/types/dto";
import { useEvolutionCategoryFilter } from "@/features/cards/use-evolution-category-filter";

type ChartRow = { month: string; total: number; paid: number; unpaid: number; [categoryId: string]: string | number };

function ValuesTable({ data, stacked }: { data: ChartRow[]; stacked: boolean }) {
  return (
    <table className="w-full text-right text-xs tabular-nums sm:text-sm">
      <thead>
        <tr className="text-text/50">
          <th className="py-1 text-left font-medium">Mês</th>
          {stacked ? (
            <th className="py-1 font-medium">Total</th>
          ) : (
            <>
              <th className="py-1 font-medium">
                <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-success-500" />Pago</span>
              </th>
              <th className="py-1 font-medium">
                <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-danger-500" />Falta pagar</span>
              </th>
            </>
          )}
        </tr>
      </thead>
      <tbody>
        {data.map((d) => (
          <tr key={d.month} className="border-t border-divider/60">
            <td className="py-1 text-left text-text/70">{compactMonth(d.month)}</td>
            {stacked ? (
              <td className="py-1">{d.total > 0 ? formatCurrency(d.total) : "—"}</td>
            ) : (
              <>
                <td className="py-1 text-success-600">{d.paid > 0 ? formatCurrency(d.paid) : "—"}</td>
                <td className="py-1 text-danger-600">{d.unpaid > 0 ? formatCurrency(d.unpaid) : "—"}</td>
              </>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 6 months before through 6 months after the viewed month (by installment competence),
 *  filterable by category — same additive multi-select interaction as the dashboard's category
 *  filter, but local to this chart and always EXPENSE-scoped (a card purchase is never anything
 *  else). With no category selected, bars show a single total per month; selecting one or more
 *  categories stacks each as its own colored segment (data.byCategory) instead of just narrowing
 *  the total, so the composition is visible, not just the sum. Respects whichever card the page's
 *  existing "Cartão" filter has narrowed to (or every card, if none). Visual style — per-month
 *  value labels above the bars, responsive font, "Exibir lista" table toggle — mirrors the
 *  dashboard's monthly evolution chart (`monthly-chart.tsx`) via the shared `chart-month-labels`
 *  helpers, so the two read as one system. */
export function CardEvolutionChart({ data, categories }: { data: CardMonthlyEvolutionDTO[]; categories: CategoryDTO[] }) {
  const { activeIds, toggle, clear } = useEvolutionCategoryFilter();
  const expenseCategories = categories.filter((c) => c.type === "EXPENSE");
  const stacked = activeIds.length > 0;
  const [listOpen, setListOpen] = useState(false);

  const { chartData, categoryMeta } = useMemo(() => {
    const meta = new Map<string, { name: string; color: string }>();
    const rows = data.map((row) => {
      const entry: ChartRow = { month: row.month, total: row.total, paid: row.paid, unpaid: row.unpaid };
      for (const c of row.byCategory) {
        entry[c.categoryId] = c.amount;
        if (!meta.has(c.categoryId)) meta.set(c.categoryId, { name: c.categoryName, color: c.color });
      }
      return entry;
    });
    return { chartData: rows, categoryMeta: meta };
  }, [data]);
  const categoryIds = [...categoryMeta.keys()];

  // Mesma lógica de fonte responsiva do gráfico do dashboard — ver useResponsiveLabelFont.
  const { wrapRef, font: labelFont } = useResponsiveLabelFont(
    chartData,
    stacked ? (d) => [d.total] : (d) => [d.paid, d.unpaid]
  );
  const lineGap = labelFont + 3;
  const topPad = (stacked ? 1 : 2) * lineGap + 11;

  return (
    <Card elevation="sm" className="min-h-[320px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <CardTitle>Evolução mensal do cartão</CardTitle>
          <HelpHint id="cards.evolution" title="Evolução mensal do cartão">
            <p>Quanto foi faturado por mês (2 meses pra trás, o mês visualizado e 3 pra frente), dividido em já pago (verde) e a pagar (vermelho).</p>
            <p>Os valores de cada mês aparecem em cima das barras. Toque em “Exibir lista” para ver a mesma informação em tabela.</p>
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
      <div ref={wrapRef} className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: topPad, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--color-divider)" />
            <XAxis dataKey="month" tickFormatter={compactMonth} tick={{ fontSize: 11, fill: "var(--color-text)" }} axisLine={{ stroke: "var(--color-divider)" }} tickLine={false} />
            <YAxis
              tickFormatter={(v) => formatCompactCurrency(v)}
              tick={{ fontSize: 11, fill: "var(--color-text)" }}
              axisLine={false}
              tickLine={false}
              width={52}
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
            <MonthLabelsOverlay
              data={chartData}
              monthKey={(d) => d.month}
              fontSize={labelFont}
              lines={(d) =>
                stacked
                  ? [{ key: "total", value: d.total, color: "var(--color-text)" }]
                  : [
                      { key: "paid", value: d.paid, color: "var(--color-success-600)" },
                      { key: "unpaid", value: d.unpaid, color: "var(--color-danger-600)" },
                    ]
              }
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <button
        type="button"
        onClick={() => setListOpen((v) => !v)}
        className="mt-1 flex w-full items-center justify-center gap-1 border-t border-divider/60 py-2 text-xs text-text/60 hover:text-text sm:text-sm"
      >
        {listOpen ? "Ocultar lista ▲" : "Exibir lista ▼"}
      </button>
      {listOpen && (
        <div className="mt-1">
          <ValuesTable data={chartData} stacked={stacked} />
        </div>
      )}
    </Card>
  );
}
