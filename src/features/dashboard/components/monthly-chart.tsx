"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  usePlotArea,
  useXAxisScale,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { CardTitleWithHelp } from "@/components/ui/help-hint";
import { formatCompactCurrency, formatCurrency } from "@/lib/utils/currency";
import { chartTooltipStyle } from "@/components/ui/chart-tooltip";
import type { MonthlyEvolutionDTO } from "@/types/dto";

// d.month já vem como "set/2026" (formatMonthLabel). Encurta pra "set/26".
function compactMonth(label: string) {
  return label.replace(/\/(\d{2})(\d{2})$/, "/$2");
}

// Valor completo sem o prefixo "R$ " pra caber no bloco por mês: "3.000,00" / "10.000,00".
function bareValue(v: number) {
  if (v <= 0) return "—";
  return formatCurrency(v).replace(/^R\$\s*/, "");
}

/**
 * Bloco de valores por mês desenhado ACIMA da área de plotagem (dentro da margem
 * superior do gráfico), 3 linhas empilhadas: receita (verde), despesa (vermelho) e,
 * quando há, o guardado em Metas (azul). Um bloco por mês, centralizado na banda —
 * nunca encavala entre meses porque cada bloco vive na sua própria coluna.
 * `fontSize` chega já calculado a partir da largura disponível (ver MonthlyChart).
 */
function MonthValueLabels({
  data,
  showReserved,
  fontSize,
}: {
  data: MonthlyEvolutionDTO[];
  showReserved: boolean;
  fontSize: number;
}) {
  const xScale = useXAxisScale();
  const plot = usePlotArea();
  if (!xScale || !plot) return null;
  const lineGap = fontSize + 3;
  const lines = showReserved ? 3 : 2;
  const firstLineY = plot.y - (lines - 1) * lineGap - 11;

  return (
    <g>
      {data.map((d) => {
        const cx = xScale(d.month, { position: "middle" });
        if (cx == null) return null;
        return (
          <text key={d.month} x={cx} textAnchor="middle" fontSize={fontSize} fontWeight={600}>
            <tspan x={cx} y={firstLineY} fill="var(--color-success-600)">{bareValue(d.income)}</tspan>
            <tspan x={cx} dy={lineGap} fill="var(--color-danger-600)">{bareValue(d.expense)}</tspan>
            {showReserved && (
              <tspan x={cx} dy={lineGap} fill="var(--color-accent-500)">{bareValue(d.reserved)}</tspan>
            )}
          </text>
        );
      })}
    </g>
  );
}

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
  // cresce no desktop onde sobra espaço (teto 13px). Medimos o container e derivamos
  // a fonte da largura de cada banda mensal — assim o número mais largo ("10.000,00")
  // sempre cabe na coluna do seu mês.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [labelFont, setLabelFont] = useState(9);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const plotWidth = el.clientWidth - 52 /* eixo Y */ - 8 /* margem direita */;
      if (plotWidth <= 0 || data.length === 0) return;
      const bandWidth = plotWidth / data.length;
      const longest = Math.max(6, ...data.flatMap((d) => [d.income, d.expense, d.reserved].map((v) => bareValue(v).length)));
      const fitted = (bandWidth * 0.92) / (longest * 0.58);
      setLabelFont(Math.max(7.5, Math.min(13, fitted)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [data]);

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
            <MonthValueLabels data={data} showReserved={showReserved} fontSize={labelFont} />
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
