"use client";

import { Card, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/currency";
import { CATEGORY_COLORS } from "@/components/ui/color-picker";
import { DonutWithTotal, type DonutEntry } from "@/components/ui/donut-with-total";
import type { AccountDTO, CardSummaryDTO } from "@/types/dto";

/**
 * Two summary donuts for /accounts: total liquid balance (CASH+BANK, by account) and total
 * credit-card usage (by card). The card donut's 100% is the combined credit limit, not the
 * combined used amount — an "Disponível" slice fills whatever headroom remains, so the same
 * "value in the middle, legend beside" shape reads differently on purpose for the two charts.
 */
export function AccountsOverviewCharts({
  liquidAccounts,
  cardEntries,
}: {
  liquidAccounts: AccountDTO[];
  cardEntries: { account: AccountDTO; summary: CardSummaryDTO }[];
}) {
  const balanceData: DonutEntry[] = liquidAccounts
    .filter((a) => a.balance > 0)
    .map((a, i) => ({
      id: a.id,
      name: a.name,
      value: a.balance,
      color: a.institutionColor ?? CATEGORY_COLORS[i % CATEGORY_COLORS.length],
    }));
  const balanceTotal = balanceData.reduce((sum, entry) => sum + entry.value, 0);

  const totalLimit = cardEntries.reduce((sum, { summary }) => sum + (summary.creditLimit ?? 0), 0);
  const totalUsed = cardEntries.reduce((sum, { summary }) => sum + summary.totalCommitted, 0);
  const usedData: DonutEntry[] = cardEntries
    .filter(({ summary }) => summary.totalCommitted > 0)
    .map(({ account, summary }, i) => ({
      id: account.id,
      name: account.name,
      value: summary.totalCommitted,
      color: account.institutionColor ?? CATEGORY_COLORS[i % CATEGORY_COLORS.length],
    }));
  const available = Math.max(totalLimit - totalUsed, 0);
  const cardChartData = available > 0 ? [...usedData, { id: "available", name: "Disponível", value: available, color: "var(--color-divider)" }] : usedData;
  const cardChartTotal = totalLimit > 0 ? totalLimit : totalUsed;

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <Card elevation="sm" className="min-h-[320px]">
        <CardTitle>Total em contas</CardTitle>
        <DonutWithTotal
          data={balanceData}
          total={balanceTotal}
          centerLabel={formatCurrency(balanceTotal)}
          centerSubLabel="saldo total"
          emptyMessage="Sem saldo em contas."
        />
      </Card>
      <Card elevation="sm" className="min-h-[320px]">
        <CardTitle>Limite usado nos cartões</CardTitle>
        <DonutWithTotal
          data={cardChartData}
          total={cardChartTotal}
          centerLabel={formatCurrency(totalUsed)}
          centerSubLabel={totalLimit > 0 ? `de ${formatCurrency(totalLimit)}` : undefined}
          emptyMessage="Nenhum cartão de crédito cadastrado."
        />
      </Card>
    </div>
  );
}
