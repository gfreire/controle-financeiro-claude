"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { CardTitleWithHelp } from "@/components/ui/help-hint";
import { formatCompactCurrency, formatCurrency } from "@/lib/utils/currency";
import { chartTooltipStyle } from "@/components/ui/chart-tooltip";
import { compactMonth, MonthLabelsOverlay, useResponsiveLabelFont } from "@/components/ui/chart-month-labels";
import type { MonthlyEvolutionDTO } from "@/types/dto";

function ValuesTable({ data, showReserved }: { data: MonthlyEvolutionDTO[]; showReserved: boolean }) {
  return (
    <table className="w-full text-right text-xs tabular-nums sm:text-sm">
      <thead>
        <tr className="text-text/50">
          <th className="py-1 text-left font-medium">Mês</th>
          <th className="py-1 font-medium">
            <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-success-500" />Receitas</span>
          </th>
          <th className="py-1 font-medium">
            <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-danger-500" />Despesas</span>
          </th>
          {showReserved && (
            <th className="py-1 font-medium">
              <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-accent-500" />Metas</span>
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {data.map((d) => (
          <tr key={d.month} className="border-t border-divider/60">
            <td className="py-1 text-left text-text/70">{compactMonth(d.month)}</td>
            <td className="py-1 text-success-600">{formatCurrency(d.income)}</td>
            <td className="py-1 text-danger-600">{formatCurrency(d.expense)}</td>
            {showReserved && <td className="py-1 text-accent-500">{d.reserved > 0 ? formatCurrency(d.reserved) : "—"}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function MonthlyChart({ data }: { data: MonthlyEvolutionDTO[] }) {
  const showReserved = data.some((d) => d.reserved > 0);
  const [listOpen, setListOpen] = useState(false);

  // Fonte do bloco de valores adapta à largura: aperta no celular (piso ~7.5px),
  // cresce no desktop onde sobra espaço (teto 13px) — ver useResponsiveLabelFont.
  const { wrapRef, font: labelFont } = useResponsiveLabelFont(data, (d) => [d.income, d.expense, d.reserved]);

  const lineGap = labelFont + 3;
  const topPad = (showReserved ? 3 : 2) * lineGap + 11;

  return (
    <Card elevation="sm" className="min-h-[320px]">
      <CardTitleWithHelp
        id="dashboard.monthly-evolution"
        helpTitle="Evolução mensal"
        help={
          <>
            <p>Receitas (verde) e despesas (vermelho) mês a mês — os 2 meses anteriores, o mês atual e os 3 próximos.</p>
            <p>Os valores de cada mês aparecem em cima das barras. Toque em “Exibir lista” para ver a mesma informação em tabela.</p>
            <p>Toda barra soma também as despesas programadas e os parcelamentos ainda não pagos daquele mês, além do que já foi lançado.</p>
            <p>A barra azul, quando aparece, é quanto você guardou em Metas naquele mês.</p>
          </>
        }
      >
        Evolução mensal
      </CardTitleWithHelp>

      <div ref={wrapRef} className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: topPad, right: 8, left: 0, bottom: 0 }}>
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
            <Bar dataKey="income" name="Receitas" fill="var(--color-success-500)" radius={[1, 1, 0, 0]} />
            <Bar dataKey="expense" name="Despesas" fill="var(--color-danger-500)" radius={[1, 1, 0, 0]} />
            {/* Fluxo do mês para/de Metas (Σ RESERVE − Σ REDEEM). Mesma unidade das outras barras;
                o acumulado vive no gráfico próprio de /goals. Não renderiza se sempre 0. */}
            {showReserved && (
              <Bar dataKey="reserved" name="Guardado (metas)" fill="var(--color-accent-500)" radius={[1, 1, 0, 0]} />
            )}
            <MonthLabelsOverlay
              data={data}
              monthKey={(d) => d.month}
              fontSize={labelFont}
              lines={(d) => [
                { key: "income", value: d.income, color: "var(--color-success-600)" },
                { key: "expense", value: d.expense, color: "var(--color-danger-600)" },
                ...(showReserved ? [{ key: "reserved", value: d.reserved, color: "var(--color-accent-500)" }] : []),
              ]}
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
          <ValuesTable data={data} showReserved={showReserved} />
        </div>
      )}
    </Card>
  );
}
