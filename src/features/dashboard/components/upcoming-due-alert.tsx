import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils/currency";
import { daysUntilDueThisMonth, todayIso } from "@/lib/utils/date";
import type { FixedExpenseDTO } from "@/types/dto";

/**
 * Always anchored to today's real month, never the dashboard's viewed-period filter — same
 * convention as CardSummaryDTO.usedThroughCurrentMonth. Renders nothing when there's nothing
 * overdue or due within 7 days, same "no empty state noise" convention as the debts pie charts.
 */
export function UpcomingDueAlert({ fixedExpenses }: { fixedExpenses: FixedExpenseDTO[] }) {
  const today = todayIso();
  const items = fixedExpenses
    .filter((expense) => !expense.isPaidThisMonth)
    .map((expense) => ({ expense, daysUntilDue: daysUntilDueThisMonth(expense.dueDay, today) }))
    .filter((item) => item.daysUntilDue <= 7)
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);

  if (items.length === 0) return null;

  return (
    <Card elevation="sm" className="gap-3 border-warning-500">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-4 text-warning-600" strokeWidth={1.5} />
        <CardTitle>Vence essa semana</CardTitle>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map(({ expense, daysUntilDue }) => (
          <li key={expense.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              {expense.name} <span className="opacity-60">· {expense.categoryName}</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="font-medium tabular-nums">{formatCurrency(expense.plannedAmount)}</span>
              {daysUntilDue < 0 ? (
                <Badge variant="danger">Atrasada há {Math.abs(daysUntilDue)}d</Badge>
              ) : daysUntilDue === 0 ? (
                <Badge variant="warning">Vence hoje</Badge>
              ) : (
                <Badge variant="warning">Vence em {daysUntilDue}d</Badge>
              )}
            </span>
          </li>
        ))}
      </ul>
      <Link href="/budgets" className="w-fit text-xs text-accent underline underline-offset-2">
        Ver despesas fixas
      </Link>
    </Card>
  );
}
