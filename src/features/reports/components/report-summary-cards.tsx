import { Card, CardKicker, CardTitle, CardMeta } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/currency";
import { TrendingUp, TrendingDown, Scale } from "lucide-react";
import type { FinancialSummaryDTO } from "@/types/dto";

/** Receitas / Despesas / Resultado of a report's whole period (no "Saldo" — account balances aren't period-scoped). */
export function ReportSummaryCards({ summary }: { summary: FinancialSummaryDTO }) {
  const positive = summary.result >= 0;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
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
      <Card elevation="sm" className="col-span-2 lg:col-span-1">
        <CardKicker className="flex items-center gap-1"><Scale className="size-3" strokeWidth={1.5} /> Resultado</CardKicker>
        <CardTitle className={positive ? "text-2xl text-success-600" : "text-2xl text-danger-600"}>{formatCurrency(summary.result)}</CardTitle>
        <CardMeta>{positive ? "Ganhou mais do que gastou" : "Gastou mais do que ganhou"}</CardMeta>
      </Card>
    </div>
  );
}
