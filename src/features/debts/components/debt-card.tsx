import { getDebtTransactions } from "@/services/debts.service";
import { Card, CardKicker, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";
import { HandCoins, Plus, Minus, Pencil } from "lucide-react";
import { DebtFormDialog } from "./debt-form-dialog";
import { DebtTransactionDialog } from "./debt-transaction-dialog";
import { DeleteDebtButton } from "./delete-debt-button";
import { DeleteDebtTransactionButton } from "./delete-debt-transaction-button";
import type { AccountDTO, CategoryDTO, DebtDTO } from "@/types/dto";

/**
 * One debt card — kicker badges, agent + edit/delete, remaining balance, "Novo valor" /
 * "Pagamento" dialogs, and the last few ledger entries. Shared verbatim by all three debt
 * screens (/debts, /overdue-bills, /installment-plans); the screens differ only in which
 * `debts.kind` they filter to, never in how a row renders. Async server component — it fetches
 * its own ledger entries.
 */
export async function DebtCard({
  debt,
  accounts,
  categories,
}: {
  debt: DebtDTO;
  /** Liquid accounts only (CASH/BANK) — a debt movement never posts against a credit card. */
  accounts: AccountDTO[];
  categories: CategoryDTO[];
}) {
  const entries = await getDebtTransactions(debt.id);

  return (
    <Card elevation="sm" className="gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <CardKicker className="flex items-center gap-1.5">
            <Badge variant={debt.side === "PAYABLE" ? "danger" : "success"}>{debt.side === "PAYABLE" ? "A pagar" : "A receber"}</Badge>
            {debt.kind === "INSTALLMENT_PLAN" &&
              (debt.paidThisMonth ? <Badge variant="success">Pago este mês</Badge> : <Badge variant="warning">Vence dia {debt.dueDay}</Badge>)}
          </CardKicker>
          <div className="flex items-center gap-1.5">
            <CardTitle className="flex items-center gap-1">
              <HandCoins className={`size-3 ${debt.side === "PAYABLE" ? "text-danger-600" : "text-success-600"}`} strokeWidth={1.5} />
              {debt.agent}
            </CardTitle>
            <DebtFormDialog
              categories={categories}
              debt={debt}
              trigger={
                <button type="button" className="p-1.5 -m-1.5 opacity-50 hover:opacity-100" aria-label="Editar dívida">
                  <Pencil className="size-3.5" strokeWidth={1.5} />
                </button>
              }
            />
            <DeleteDebtButton debtId={debt.id} agent={debt.agent} />
          </div>
          <div className="text-xl font-semibold tabular-nums">{formatCurrency(debt.remainingBalance)}</div>
          {debt.kind === "INSTALLMENT_PLAN" && debt.monthlyAmount !== undefined && (
            <p className="text-xs opacity-60">{formatCurrency(debt.monthlyAmount)}/mês combinado</p>
          )}
        </div>
        <div className="flex gap-2">
          <DebtTransactionDialog
            debtId={debt.id}
            debtName={debt.agent}
            debtSide={debt.side}
            currentBalance={debt.remainingBalance}
            mode="increase"
            accounts={accounts}
            categories={categories}
            trigger={<Button size="sm" variant="secondary"><Plus className="size-3.5" strokeWidth={1.5} /> Novo valor</Button>}
          />
          <DebtTransactionDialog
            debtId={debt.id}
            debtName={debt.agent}
            debtSide={debt.side}
            currentBalance={debt.remainingBalance}
            mode="payment"
            accounts={accounts}
            categories={categories}
            defaultCategoryId={debt.defaultCategoryId}
            defaultAmount={debt.kind === "INSTALLMENT_PLAN" ? debt.monthlyAmount : undefined}
            trigger={<Button size="sm"><Minus className="size-3.5" strokeWidth={1.5} /> Pagamento</Button>}
          />
        </div>
      </div>
      {entries.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {entries.slice(0, 8).map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-2 border-b border-text/[0.06] py-1">
              <span className="opacity-70">{formatDate(entry.date)} {entry.description && `· ${entry.description}`}</span>
              <span className="flex items-center gap-2">
                <span className={entry.amount >= 0 ? "text-danger-600 tabular-nums" : "text-success-600 tabular-nums"}>
                  {formatCurrency(entry.amount)}
                </span>
                <span className="flex items-center gap-1">
                  <DebtTransactionDialog
                    debtId={debt.id}
                    debtName={debt.agent}
                    debtSide={debt.side}
                    currentBalance={debt.remainingBalance}
                    mode={entry.amount < 0 ? "payment" : "increase"}
                    accounts={accounts}
                    categories={categories}
                    defaultCategoryId={debt.defaultCategoryId}
                    entry={entry}
                    trigger={
                      <button type="button" className="p-1.5 -m-1.5 opacity-60 hover:opacity-100" aria-label="Editar lançamento">
                        <Pencil className="size-3" strokeWidth={1.5} />
                      </button>
                    }
                  />
                  <DeleteDebtTransactionButton
                    entryId={entry.id}
                    description={entry.description ?? ""}
                    isLinked={Boolean(entry.linkedTransactionId)}
                  />
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
