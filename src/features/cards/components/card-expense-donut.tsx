"use client";

import { Card, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/currency";
import { CATEGORY_COLORS } from "@/components/ui/color-picker";
import { DonutWithTotal, type DonutEntry } from "@/components/ui/donut-with-total";
import { cn } from "@/lib/utils/cn";
import type { AccountDTO, CardSummaryDTO } from "@/types/dto";

/**
 * Donut of the viewed month's invoiced total (CardSummaryDTO.currentMonthInvoice — the historical
 * billed fact, same figure shown on each card's own "Fatura de {mês}" line), segmented by card.
 * The total in the middle is the sum across every card shown, matching what each card's own line
 * would sum to.
 */
export function CardExpenseDonut({ cardEntries }: { cardEntries: { account: AccountDTO; summary: CardSummaryDTO }[] }) {
  const data: DonutEntry[] = cardEntries
    .filter(({ summary }) => summary.currentMonthInvoice > 0)
    .map(({ account, summary }, i) => ({
      id: account.id,
      name: account.name,
      value: summary.currentMonthInvoice,
      color: account.institutionColor ?? CATEGORY_COLORS[i % CATEGORY_COLORS.length],
    }));
  const total = data.reduce((sum, entry) => sum + entry.value, 0);

  return (
    <Card elevation="sm" className={cn(data.length > 0 && "min-h-[320px]")}>
      <CardTitle>Gastos do mês por cartão</CardTitle>
      <DonutWithTotal
        data={data}
        total={total}
        centerLabel={formatCurrency(total)}
        centerSubLabel="gasto total"
        emptyMessage="Sem gastos neste mês."
      />
    </Card>
  );
}
