"use client";

import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { RotateCcw } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/currency";
import { CATEGORY_COLORS } from "@/components/ui/color-picker";
import { DonutWithTotal, type DonutEntry } from "@/components/ui/donut-with-total";
import { chartTooltipStyle } from "@/components/ui/chart-tooltip";
import { cn } from "@/lib/utils/cn";
import type { AccountDTO, CardSummaryDTO } from "@/types/dto";

/**
 * Card-limit donut's filter: clicking a card isolates it (shows just that card's own
 * limit/used/available), clicking a second card adds it to the selection (combined
 * limit/used/available across the selection), clicking a selected card again removes it —
 * emptying the selection falls back to showing every card. Deliberately the inverse of
 * DebtsCharts' click-to-remove toggle (AI_CONTEXT.md doesn't cover this, decided 2026-08-23
 * at the user's request): here the default view is "all cards combined," not "all cards,"
 * and a click always narrows/composes the selection rather than excluding from the whole set.
 */
function CardLimitDonut({ cardEntries }: { cardEntries: { account: AccountDTO; summary: CardSummaryDTO }[] }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (cardEntries.length === 0) {
    return (
      <Card elevation="sm">
        <CardTitle>Limite usado nos cartões</CardTitle>
        <p className="flex-1 text-sm opacity-60">Nenhum cartão de crédito cadastrado.</p>
      </Card>
    );
  }

  const hasSelection = selectedIds.size > 0;
  const active = hasSelection ? cardEntries.filter(({ account }) => selectedIds.has(account.id)) : cardEntries;

  const totalLimit = active.reduce((sum, { summary }) => sum + (summary.creditLimit ?? 0), 0);
  const totalUsed = active.reduce((sum, { summary }) => sum + summary.totalCommitted, 0);
  const available = Math.max(totalLimit - totalUsed, 0);

  const usedData: DonutEntry[] = active
    .filter(({ summary }) => summary.totalCommitted > 0)
    .map(({ account, summary }, i) => ({
      id: account.id,
      name: account.name,
      value: summary.totalCommitted,
      color: account.institutionColor ?? CATEGORY_COLORS[i % CATEGORY_COLORS.length],
    }));
  const chartData: DonutEntry[] =
    available > 0 ? [...usedData, { id: "available", name: "Disponível", value: available, color: "var(--color-divider)" }] : usedData;
  const isEmpty = chartData.length === 0;
  const pieData = isEmpty ? [{ id: "__empty__", name: "", value: 1, color: "var(--color-divider)" }] : chartData;

  return (
    <Card elevation="sm" className="min-h-[320px]">
      <div className="flex items-center gap-2">
        {hasSelection && (
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="flex items-center gap-1 p-1.5 -m-1.5 text-text/50 hover:text-accent"
            aria-label="Mostrar todos os cartões"
          >
            <RotateCcw className="size-4" strokeWidth={1.5} />
          </button>
        )}
        <CardTitle>Limite usado nos cartões</CardTitle>
      </div>
      <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto]">
        <div className="relative h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                innerRadius="60%"
                outerRadius="85%"
                paddingAngle={isEmpty ? 0 : 1}
                onClick={
                  isEmpty
                    ? undefined
                    : (_, index) => {
                        const id = pieData[index].id;
                        if (id !== "available") toggle(id);
                      }
                }
                cursor={isEmpty ? "default" : "pointer"}
              >
                {pieData.map((entry) => (
                  <Cell key={entry.id} fill={entry.color} stroke="var(--color-bg)" strokeWidth={1} />
                ))}
              </Pie>
              {!isEmpty && <Tooltip formatter={(value) => formatCurrency(Number(value))} {...chartTooltipStyle} />}
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-semibold tabular-nums">{formatCurrency(totalUsed)}</span>
            {totalLimit > 0 && <span className="text-[11px] opacity-60">de {formatCurrency(totalLimit)}</span>}
          </div>
        </div>
        <ul className="flex flex-col gap-1.5 text-xs">
          {cardEntries.map(({ account, summary }, i) => {
            const selected = selectedIds.has(account.id);
            const dimmed = hasSelection && !selected;
            return (
              <li
                key={account.id}
                onClick={() => toggle(account.id)}
                className={`flex cursor-pointer items-center gap-1.5 select-none ${dimmed ? "opacity-40" : ""}`}
              >
                <span
                  className="size-2.5 shrink-0"
                  style={{ background: dimmed ? "var(--color-divider)" : account.institutionColor ?? CATEGORY_COLORS[i % CATEGORY_COLORS.length] }}
                />
                <span className="flex-1 truncate">{account.name}</span>
                <span className="opacity-60 tabular-nums">{formatCurrency(summary.totalCommitted)}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}

/**
 * Two summary donuts for /accounts: total liquid balance (CASH+BANK, by account) and total
 * credit-card usage (by card, with per-card isolate/compose selection — see CardLimitDonut).
 * The card donut's 100% is the combined credit limit, not the combined used amount — an
 * "Disponível" slice fills whatever headroom remains, so the same "value in the middle, legend
 * beside" shape reads differently on purpose for the two charts.
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

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <Card elevation="sm" className={cn(balanceData.length > 0 && "min-h-[320px]")}>
        <CardTitle>Total em contas</CardTitle>
        <DonutWithTotal
          data={balanceData}
          total={balanceTotal}
          centerLabel={formatCurrency(balanceTotal)}
          centerSubLabel="saldo total"
          emptyMessage="Sem saldo em contas."
        />
      </Card>
      <CardLimitDonut cardEntries={cardEntries} />
    </div>
  );
}
