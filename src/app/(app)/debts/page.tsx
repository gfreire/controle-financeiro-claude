import { getDebts, getDebtTransactions } from "@/services/debts.service";
import { getAccounts } from "@/services/accounts.service";
import { getCategories } from "@/services/categories.service";
import { Card, CardKicker, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";
import { HandCoins, Plus, Minus, Pencil } from "lucide-react";
import { DebtFormDialog } from "@/features/debts/components/debt-form-dialog";
import { DebtTransactionDialog } from "@/features/debts/components/debt-transaction-dialog";
import { DebtsCharts } from "@/features/debts/components/debts-charts";
import { DeleteDebtButton } from "@/features/debts/components/delete-debt-button";
import { DeleteDebtTransactionButton } from "@/features/debts/components/delete-debt-transaction-button";

export default async function DebtsPage() {
  const [debts, accounts, categories] = await Promise.all([getDebts(), getAccounts(), getCategories()]);
  const liquidAccounts = accounts.filter((a) => a.type !== "CREDIT_CARD");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-semibold">Dívidas</h1>
        <DebtFormDialog categories={categories} />
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
                      <CardKicker>
                        <Badge variant={debt.side === "PAYABLE" ? "danger" : "success"}>{debt.side === "PAYABLE" ? "A pagar" : "A receber"}</Badge>
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
                    </div>
                    <div className="flex gap-2">
                      <DebtTransactionDialog
                        debtId={debt.id}
                        debtName={debt.agent}
                        debtSide={debt.side}
                        currentBalance={debt.remainingBalance}
                        mode="increase"
                        accounts={liquidAccounts}
                        categories={categories}
                        trigger={<Button size="sm" variant="secondary"><Plus className="size-3.5" strokeWidth={1.5} /> Novo valor</Button>}
                      />
                      <DebtTransactionDialog
                        debtId={debt.id}
                        debtName={debt.agent}
                        debtSide={debt.side}
                        currentBalance={debt.remainingBalance}
                        mode="payment"
                        accounts={liquidAccounts}
                        categories={categories}
                        defaultCategoryId={debt.defaultCategoryId}
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
                                accounts={liquidAccounts}
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
            })
          )}
        </div>
      )}
    </div>
  );
}
