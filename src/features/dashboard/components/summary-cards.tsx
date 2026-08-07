import { Card, CardKicker, CardTitle, CardMeta } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils/currency";
import { formatPercentage } from "@/lib/utils/number";
import { TrendingUp, TrendingDown, Wallet, Scale, TriangleAlert } from "lucide-react";
import type { FinancialSummaryDTO } from "@/types/dto";

export function SummaryCards({ summary }: { summary: FinancialSummaryDTO }) {
  const resultPositive = summary.result >= 0;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Card elevation="sm">
        <CardKicker className="flex items-center gap-1"><Wallet className="size-3" strokeWidth={1.5} /> Saldo</CardKicker>
        <CardTitle className="text-2xl">{formatCurrency(summary.balance)}</CardTitle>
        <CardMeta>Saldo total nas contas</CardMeta>
      </Card>

      <Card elevation="sm">
        <CardKicker className="flex items-center gap-1 !text-success-600"><TrendingUp className="size-3" strokeWidth={1.5} /> Receitas</CardKicker>
        <CardTitle className="text-2xl text-success-600">{formatCurrency(summary.income)}</CardTitle>
        <CardMeta>No período selecionado</CardMeta>
      </Card>

      <Card elevation="sm">
        <CardKicker className="flex items-center gap-1 !text-danger-600"><TrendingDown className="size-3" strokeWidth={1.5} /> Despesas</CardKicker>
        <CardTitle className="text-2xl text-danger-600">{formatCurrency(summary.expense)}</CardTitle>
        <CardMeta>No período selecionado</CardMeta>
      </Card>

      <Card elevation="sm">
        <CardKicker className="flex items-center gap-1"><Scale className="size-3" strokeWidth={1.5} /> Resultado</CardKicker>
        <CardTitle className={resultPositive ? "text-2xl text-success-600" : "text-2xl text-danger-600"}>
          {formatCurrency(summary.result)}
        </CardTitle>
        {summary.adjustmentShare > 0 && (
          <CardMeta>
            <Badge variant={summary.adjustmentShare > 15 ? "warning" : "neutral"} className="gap-1">
              <TriangleAlert className="size-3" strokeWidth={1.5} />
              {formatPercentage(summary.adjustmentShare)} em Ajuste
            </Badge>
          </CardMeta>
        )}
      </Card>
    </div>
  );
}
