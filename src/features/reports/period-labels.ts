import { formatDate } from "@/lib/utils/date";
import type { ReportDTO, ReportPeriodPreset } from "@/types/dto";

export const PERIOD_LABELS: Record<ReportPeriodPreset, string> = {
  month: "Mês atual",
  lastMonth: "Mês passado",
  last3: "Últimos 3 meses",
  last6: "Últimos 6 meses",
  last12: "Últimos 12 meses",
  year: "Este ano",
  lastYear: "Ano passado",
  all: "Todo o período",
  custom: "Personalizado",
};

export const PERIOD_OPTIONS = Object.entries(PERIOD_LABELS) as [ReportPeriodPreset, string][];

/** "Este ano" / "10/01/2026 – 20/01/2026" — the period as the user picked it. */
export function describeReportPeriod(report: Pick<ReportDTO, "periodPreset" | "periodStart" | "periodEnd">): string {
  if (report.periodPreset === "custom" && report.periodStart && report.periodEnd) {
    return `${formatDate(report.periodStart)} – ${formatDate(report.periodEnd)}`;
  }
  return PERIOD_LABELS[report.periodPreset];
}

export const CARD_BASIS_LABELS: Record<ReportDTO["cardBasis"], string> = {
  competence: "Parcelas por mês",
  purchase: "Compra pelo valor cheio",
};
