import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils/currency";
import { daysUntilDueThisMonth, monthKey, todayIso } from "@/lib/utils/date";
import { PayFixedExpenseDialog } from "@/features/budgets/components/pay-fixed-expense-dialog";
import type { AccountDTO, FixedExpenseDTO } from "@/types/dto";

/**
 * Always anchored to today's real month, never the dashboard's viewed-period filter — same
 * convention as CardSummaryDTO.usedThroughCurrentMonth. Renders nothing when there's nothing
 * overdue or due within 7 days, same "no empty state noise" convention as the debts pie charts.
 *
 * Row text deliberately drops the category name (mobile audit 2026-08-26) — it never added
 * anything OpenDebtsAlert's own rows didn't already do without it, and the row needs the space
 * for the "Pagar" trigger below instead. Reuses the same PayFixedExpenseDialog the /budgets tree
 * already opens per row, so there's still exactly one payment codepath, just a second trigger
 * for it — mirrors OpenDebtsAlert's own inline "Registrar pagamento" link one section down.
 */
export function UpcomingDueAlert({ fixedExpenses, accounts }: { fixedExpenses: FixedExpenseDTO[]; accounts: AccountDTO[] }) {
  const today = todayIso();
  const month = monthKey(today);
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
            <span>{expense.name}</span>
            <span className="flex items-center gap-2">
              <span className="font-medium tabular-nums">{formatCurrency(expense.plannedAmount)}</span>
              {daysUntilDue < 0 ? (
                <Badge variant="danger">Atrasada há {Math.abs(daysUntilDue)}d</Badge>
              ) : daysUntilDue === 0 ? (
                <Badge variant="warning">Vence hoje</Badge>
              ) : (
                <Badge variant="warning">Vence em {daysUntilDue}d</Badge>
              )}
              <PayFixedExpenseDialog
                expense={expense}
                accounts={accounts}
                month={month}
                trigger={<Button variant="ghost" size="sm" className="h-auto px-2 py-1 text-xs">Pagar</Button>}
              />
            </span>
          </li>
        ))}
      </ul>
      <Link href="/budgets" className="w-fit text-xs text-accent underline underline-offset-2">
        Ver despesas programadas
      </Link>
    </Card>
  );
}
