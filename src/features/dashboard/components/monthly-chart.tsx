"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { CardTitleWithHelp } from "@/components/ui/help-hint";
import { formatCompactCurrency, formatCurrency } from "@/lib/utils/currency";
import { chartTooltipStyle } from "@/components/ui/chart-tooltip";
import type { MonthlyEvolutionDTO } from "@/types/dto";

export function MonthlyChart({ data }: { data: MonthlyEvolutionDTO[] }) {
  return (
    <Card elevation="sm" className="min-h-[320px]">
      <CardTitleWithHelp
        id="dashboard.monthly-evolution"
        helpTitle="Evolução mensal"
        help={
          <>
            <p>Receitas (verde) e despesas (vermelho) mês a mês — 12 meses atrás e 3 à frente.</p>
            <p>A barra do mês atual já soma o que ainda falta pagar (faturas, despesas programadas); os outros meses são só o que de fato aconteceu.</p>
            <p>A barra roxa, quando aparece, é quanto você guardou em Metas naquele mês.</p>
          </>
        }
      >
        Evolução mensal
      </CardTitleWithHelp>
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
            <Tooltip formatter={(value) => formatCurrency(Number(value))} {...chartTooltipStyle} />
            <Bar dataKey="income" name="Receitas" fill="var(--color-success-500)" radius={[1, 1, 0, 0]} />
            <Bar dataKey="expense" name="Despesas" fill="var(--color-danger-500)" radius={[1, 1, 0, 0]} />
            {/* Fluxo do mês para/de Metas (Σ RESERVE − Σ REDEEM). Mesma unidade das outras barras;
                o acumulado vive no gráfico próprio de /goals. Não renderiza se sempre 0. */}
            {data.some((d) => d.reserved > 0) && (
              <Bar dataKey="reserved" name="Guardado (metas)" fill="var(--color-accent)" radius={[1, 1, 0, 0]} />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
