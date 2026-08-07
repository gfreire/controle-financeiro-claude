import { getDebts, getDebtTransactions } from "@/services/debts.service";
import { getAccounts } from "@/services/accounts.service";
import { Card, CardKicker, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";
import { HandCoins, Plus, Minus } from "lucide-react";
import { DebtFormDialog } from "@/features/debts/components/debt-form-dialog";
import { DebtTransactionDialog } from "@/features/debts/components/debt-transaction-dialog";
import { DebtsCharts } from "@/features/debts/components/debts-charts";

export default async function DebtsPage() {
  const [debts, accounts] = await Promise.all([getDebts(), getAccounts()]);
  const liquidAccounts = accounts.filter((a) => a.type !== "CREDIT_CARD");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-semibold">Dívidas</h1>
        <DebtFormDialog />
      </div>

      <DebtsCharts debts={debts} />

      {debts.length === 0 ? (
        <p className="text-sm opacity-60">Nenhuma dívida registrada.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {await Promise.all(
            debts.map(async (debt) => {
              const entries = await getDebtTransactions(debt.id);
              return (
                <Card key={debt.id} elevation="sm" className="gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <CardKicker className="flex items-center gap-1">
                        <HandCoins className="size-3" strokeWidth={1.5} />
                        <Badge variant={debt.side === "PAYABLE" ? "danger" : "success"}>{debt.side === "PAYABLE" ? "A pagar" : "A receber"}</Badge>
                      </CardKicker>
                      <CardTitle>{debt.agent}</CardTitle>
                      <div className="text-xl font-semibold tabular-nums">{formatCurrency(debt.remainingBalance)}</div>
                    </div>
                    <div className="flex gap-2">
                      <DebtTransactionDialog
                        debtId={debt.id}
                        debtName={debt.agent}
                        currentBalance={debt.remainingBalance}
                        mode="increase"
                        accounts={liquidAccounts}
                        trigger={<Button size="sm" variant="secondary"><Plus className="size-3.5" strokeWidth={1.5} /> Novo valor</Button>}
                      />
                      <DebtTransactionDialog
                        debtId={debt.id}
                        debtName={debt.agent}
                        currentBalance={debt.remainingBalance}
                        mode="payment"
                        accounts={liquidAccounts}
                        trigger={<Button size="sm"><Minus className="size-3.5" strokeWidth={1.5} /> Pagamento</Button>}
                      />
                    </div>
                  </div>
                  {entries.length > 0 && (
                    <ul className="flex flex-col gap-1 text-sm">
                      {entries.slice(0, 8).map((entry) => (
                        <li key={entry.id} className="flex items-center justify-between border-b border-text/[0.06] py-1">
                          <span className="opacity-70">{formatDate(entry.date)} {entry.description && `· ${entry.description}`}</span>
                          <span className={entry.amount >= 0 ? "text-danger-600 tabular-nums" : "text-success-600 tabular-nums"}>
                            {formatCurrency(entry.amount)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
