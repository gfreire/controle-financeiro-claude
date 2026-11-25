import { Card, CardKicker, CardTitle, CardMeta } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/currency";
import { TrendingUp, TrendingDown, Scale, CalendarClock } from "lucide-react";
import type { FinancialSummaryDTO, FutureSummaryDTO } from "@/types/dto";

/**
 * Receitas / Despesas / Resultado of a report's whole period (no "Saldo" — account balances aren't
 * period-scoped), plus a fourth "Ainda a realizar" box when part of those totals hasn't happened yet
 * (future installments, future-dated entries, projected unpaid obligations).
 */
export function ReportSummaryCards({ summary, future }: { summary: FinancialSummaryDTO; future: FutureSummaryDTO }) {
  const positive = summary.result >= 0;
  const hasFuture = future.count > 0;
  const futurePositive = future.result >= 0;
  return (
    <div className={hasFuture ? "grid grid-cols-2 gap-3 lg:grid-cols-4" : "grid grid-cols-2 gap-3 lg:grid-cols-3"}>
      <Card elevation="sm">
        <CardKicker className="flex items-center gap-1 !text-success-600"><TrendingUp className="size-3" strokeWidth={1.5} /> Receitas</CardKicker>
        <CardTitle className="text-2xl text-success-600">{formatCurrency(summary.income)}</CardTitle>
        <CardMeta>No período do relatório</CardMeta>
      </Card>
      <Card elevation="sm">
        <CardKicker className="flex items-center gap-1 !text-danger-600"><TrendingDown className="size-3" strokeWidth={1.5} /> Despesas</CardKicker>
        <CardTitle className="text-2xl text-danger-600">{formatCurrency(summary.expense)}</CardTitle>
        <CardMeta>No período do relatório</CardMeta>
      </Card>
      <Card elevation="sm" className={hasFuture ? undefined : "col-span-2 lg:col-span-1"}>
        <CardKicker className="flex items-center gap-1"><Scale className="size-3" strokeWidth={1.5} /> Resultado</CardKicker>
        <CardTitle className={positive ? "text-2xl text-success-600" : "text-2xl text-danger-600"}>{formatCurrency(summary.result)}</CardTitle>
        <CardMeta>{positive ? "Ganhou mais do que gastou" : "Gastou mais do que ganhou"}</CardMeta>
      </Card>
      {hasFuture && (
        <Card elevation="sm">
          <CardKicker className="flex items-center gap-1"><CalendarClock className="size-3" strokeWidth={1.5} /> Ainda a realizar</CardKicker>
          <CardTitle className={futurePositive ? "text-2xl text-success-600" : "text-2xl text-danger-600"}>{formatCurrency(future.result)}</CardTitle>
          <CardMeta className="flex-col items-start gap-0.5">
            {future.expense > 0 && <span>{formatCurrency(future.expense)} a pagar</span>}
            {future.income > 0 && <span>{formatCurrency(future.income)} a receber</span>}
            <span className="opacity-70">Já somado em Receitas, Despesas e Resultado</span>
          </CardMeta>
        </Card>
      )}
    </div>
  );
}
