import { AlertTriangle } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils/currency";
import { daysUntilDueThisMonth, todayIso } from "@/lib/utils/date";
import { DebtTransactionDialog } from "@/features/debts/components/debt-transaction-dialog";
import type { AccountDTO, CategoryDTO, DebtDTO } from "@/types/dto";

/**
 * "Dívidas em aberto" (AI_CONTEXT.md "Dívidas — subtipos") — ao contrário de uma dívida PERSONAL
 * (nunca afeta o dashboard, ver "Money Reality Rules"), OVERDUE_BILL e INSTALLMENT_PLAN sempre
 * aparecem aqui, mesmo sem nenhum filtro de período — são compromissos em aberto, não um evento
 * datado. `totalOpenDebts` já vem somado do caller (dashboard/page.tsx), nunca calculado aqui
 * (Chart Rules: agregação sempre no server, nunca reduce() num componente).
 */
export function OpenDebtsAlert({
  debts,
  totalOpenDebts,
  accounts,
  categories,
}: {
  debts: DebtDTO[];
  totalOpenDebts: number;
  accounts: AccountDTO[];
  categories: CategoryDTO[];
}) {
  if (debts.length === 0) return null;
  const today = todayIso();

  return (
    <Card elevation="sm" className="gap-3 border-danger-500">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-danger-600" strokeWidth={1.5} />
          <CardTitle>Dívidas em aberto</CardTitle>
        </div>
        <span className="text-lg font-semibold tabular-nums text-danger-600">{formatCurrency(totalOpenDebts)}</span>
      </div>
      <ul className="flex flex-col gap-2">
        {debts.map((debt) => {
          const daysUntilDue = debt.kind === "INSTALLMENT_PLAN" && debt.dueDay ? daysUntilDueThisMonth(debt.dueDay, today) : undefined;
          const defaultAmount = debt.kind === "INSTALLMENT_PLAN" ? debt.monthlyAmount : debt.remainingBalance;
          return (
            <li key={debt.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>{debt.agent}</span>
              <span className="flex items-center gap-2">
                <span className="font-medium tabular-nums">{formatCurrency(debt.remainingBalance)}</span>
                {debt.kind === "OVERDUE_BILL" && <Badge variant="danger">Atrasada</Badge>}
                {debt.kind === "INSTALLMENT_PLAN" &&
                  (debt.paidThisMonth ? (
                    <Badge variant="success">Pago este mês</Badge>
                  ) : daysUntilDue !== undefined && daysUntilDue < 0 ? (
                    <Badge variant="danger">Atrasada há {Math.abs(daysUntilDue)}d</Badge>
                  ) : daysUntilDue === 0 ? (
                    <Badge variant="warning">Vence hoje</Badge>
                  ) : (
                    <Badge variant="warning">Vence em {daysUntilDue}d</Badge>
                  ))}
                {!debt.paidThisMonth && (
                  <DebtTransactionDialog
                    debtId={debt.id}
                    debtName={debt.agent}
                    debtSide={debt.side}
                    currentBalance={debt.remainingBalance}
                    mode="payment"
                    accounts={accounts}
                    categories={categories}
                    defaultCategoryId={debt.defaultCategoryId}
                    defaultAmount={defaultAmount}
                    trigger={<button className="text-xs text-accent underline underline-offset-2">Registrar pagamento</button>}
                  />
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
