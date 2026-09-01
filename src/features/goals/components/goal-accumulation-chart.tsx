"use client";

import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { CardTitleWithHelp } from "@/components/ui/help-hint";
import { formatCompactCurrency, formatCurrency } from "@/lib/utils/currency";
import { chartTooltipStyle } from "@/components/ui/chart-tooltip";
import type { GoalAccumulationDTO } from "@/types/dto";

/** Total held across all goals at each month-end (last 13 months), with a reference line at the
 * sum of every goal's target. Cumulative — the running total, unlike the dashboard's monthly
 * "Reservado" flow bar. */
export function GoalAccumulationChart({ data }: { data: GoalAccumulationDTO }) {
  if (data.points.every((p) => p.total === 0)) return null;

  return (
    <Card elevation="sm">
      <CardTitleWithHelp
        id="goals.accumulation"
        helpTitle="Acumulado guardado"
        help={
          <>
            <p>Total guardado somando todas as metas, no fim de cada um dos últimos 13 meses.</p>
            <p>A linha tracejada é a soma de todos os valores-alvo.</p>
          </>
        }
      >
        Acumulado guardado
      </CardTitleWithHelp>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
            {data.targetTotal > 0 && (
              <ReferenceLine
                y={data.targetTotal}
                stroke="var(--color-accent)"
                strokeDasharray="4 4"
                ifOverflow="extendDomain"
                label={{ value: "Alvo total", position: "insideTopRight", fontSize: 10, fill: "var(--color-accent)" }}
              />
            )}
            <Bar dataKey="total" name="Guardado" fill="var(--color-success-500)" radius={[1, 1, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
