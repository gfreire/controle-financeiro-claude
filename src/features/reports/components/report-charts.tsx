"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { MonthlyChart } from "@/features/dashboard/components/monthly-chart";
import { ReportResultChart } from "./report-result-chart";
import type { ReportChartSeriesDTO, ReportGranularity } from "@/types/dto";

const GRANULARITY_OPTIONS: { value: ReportGranularity; label: string; bucket: string; title: string }[] = [
  { value: "month", label: "Mês", bucket: "Mês", title: "Evolução mensal" },
  { value: "quarter", label: "Trimestre", bucket: "Trimestre", title: "Evolução trimestral" },
  { value: "year", label: "Ano", bucket: "Ano", title: "Evolução anual" },
];

/** Minimum px per bar — past what fits on screen, the charts scroll sideways instead of squeezing. */
const MIN_BAND_WIDTH = 56;

/**
 * The report's two time charts (evolution + result), sharing one "Mês / Trimestre / Ano" zoom.
 * The service already built every granularity (getReportChartSeries) — this only picks one. The
 * toggle shows when there's more than a year of data; the initial pick keeps the bar count readable.
 */
export function ReportCharts({ series }: { series: ReportChartSeriesDTO }) {
  const [granularity, setGranularity] = useState<ReportGranularity>(series.defaultGranularity);
  const option = GRANULARITY_OPTIONS.find((o) => o.value === granularity)!;
  const data = series[granularity];
  const showToggle = series.monthCount > 12;

  const toggle = showToggle ? (
    <div className="inline-flex overflow-hidden border border-divider text-[12px]" role="group" aria-label="Agrupar por">
      {GRANULARITY_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => setGranularity(o.value)}
          className={cn(
            "border-l border-divider px-2.5 py-1 first:border-l-0",
            granularity === o.value ? "bg-accent text-bg" : "hover:bg-text/[0.06]"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <>
      <MonthlyChart
        data={data}
        title={option.title}
        bucketLabel={option.bucket}
        minBandWidth={MIN_BAND_WIDTH}
        headerExtra={toggle}
        helpId="reports.monthly-evolution"
        help={
          <>
            <p>Receitas (verde) e despesas (vermelho) do período do relatório — por mês, trimestre ou ano.</p>
            <p>Meses vazios no começo e no fim do período ficam de fora. Com muitas barras, arraste o gráfico para o lado.</p>
            <p>Com “Parcelas por mês”, cada parcela do cartão cai no mês da fatura; com “Compra pelo valor cheio”, a compra inteira cai no mês em que foi feita.</p>
          </>
        }
      />
      {data.length > 1 && <ReportResultChart data={data} minBandWidth={MIN_BAND_WIDTH} />}
    </>
  );
}
