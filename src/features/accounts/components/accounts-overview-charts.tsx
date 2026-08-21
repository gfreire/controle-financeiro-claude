"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/currency";
import { toPercentage } from "@/lib/utils/number";
import { chartTooltipStyle } from "@/components/ui/chart-tooltip";
import { CATEGORY_COLORS } from "@/components/ui/color-picker";
import type { AccountDTO, CardSummaryDTO } from "@/types/dto";

type DonutEntry = { id: string; name: string; value: number; color: string };

function DonutWithTotal({
  data,
  total,
  centerLabel,
  centerSubLabel,
  emptyMessage,
}: {
  data: DonutEntry[];
  total: number;
  centerLabel: string;
  centerSubLabel?: string;
  emptyMessage: string;
}) {
  if (data.length === 0 || total <= 0) {
    return <p className="flex-1 text-sm opacity-60">{emptyMessage}</p>;
  }

  return (
    <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto]">
      <div className="relative h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="60%" outerRadius="85%" paddingAngle={1}>
              {data.map((entry) => (
                <Cell key={entry.id} fill={entry.color} stroke="var(--color-bg)" strokeWidth={1} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => formatCurrency(Number(value))} {...chartTooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-semibold tabular-nums">{centerLabel}</span>
          {centerSubLabel && <span className="text-[11px] opacity-60">{centerSubLabel}</span>}
        </div>
      </div>
      <ul className="flex flex-col gap-1.5 text-xs">
        {data.map((entry) => (
          <li key={entry.id} className="flex items-center gap-1.5">
            <span className="size-2.5 shrink-0" style={{ background: entry.color }} />
            <span className="flex-1 truncate">{entry.name}</span>
            <span className="opacity-60">{toPercentage(entry.value, total)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

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
