"use client";

import { Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { CardTitleWithHelp } from "@/components/ui/help-hint";
import { formatCompactCurrency, formatCurrency } from "@/lib/utils/currency";
import { chartTooltipStyle } from "@/components/ui/chart-tooltip";
import { compactMonth } from "@/components/ui/chart-month-labels";
import type { ReportResultPointDTO } from "@/types/dto";

/** Monthly result (bars, green/red by sign) + running total (line) — "quanto já ganhei/perdi até aqui". */
export function ReportResultChart({ data }: { data: ReportResultPointDTO[] }) {
  return (
    <Card elevation="sm" className="min-h-[300px]">
      <CardTitleWithHelp
        id="reports.result"
        helpTitle="Resultado acumulado"
        help={
          <>
            <p>As barras são o resultado de cada mês (receitas menos despesas): verde quando sobrou, vermelho quando faltou.</p>
            <p>A linha soma esses resultados mês a mês — é o quanto você já ganhou ou perdeu desde o começo do período.</p>
          </>
        }
      >
        Resultado acumulado
      </CardTitleWithHelp>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--color-divider)" />
            <XAxis dataKey="month" tickFormatter={compactMonth} tick={{ fontSize: 11, fill: "var(--color-text)" }} axisLine={{ stroke: "var(--color-divider)" }} tickLine={false} />
            <YAxis tickFormatter={(v) => formatCompactCurrency(v)} tick={{ fontSize: 11, fill: "var(--color-text)" }} axisLine={false} tickLine={false} width={52} />
            <ReferenceLine y={0} stroke="var(--color-text)" strokeOpacity={0.3} />
            <Tooltip formatter={(value) => formatCurrency(Number(value))} {...chartTooltipStyle} />
            <Bar dataKey="result" name="Resultado do mês" radius={[1, 1, 0, 0]}>
              {data.map((point) => (
                <Cell key={point.month} fill={point.result >= 0 ? "var(--color-success-500)" : "var(--color-danger-500)"} />
              ))}
            </Bar>
            <Line dataKey="cumulative" name="Acumulado" type="monotone" stroke="var(--color-accent-500)" strokeWidth={2} dot={{ r: 2.5 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
