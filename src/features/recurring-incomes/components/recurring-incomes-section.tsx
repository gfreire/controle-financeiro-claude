import { Card } from "@/components/ui/card";
import { CardTitleWithHelp } from "@/components/ui/help-hint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils/currency";
import { Check, CircleDollarSign } from "lucide-react";
import { RecurringIncomeFormDialog } from "./recurring-income-form-dialog";
import { RegisterReceiptDialog } from "./register-receipt-dialog";
import { DeleteRecurringIncomeButton } from "./delete-recurring-income-button";
import type { AccountDTO, CategoryDTO, RecurringIncomeDTO } from "@/types/dto";

/**
 * "Receitas Recorrentes" block on /budgets — the mirror of the fixed-expense rows, for
 * predictable income. Template + monthly "já recebi?" checklist. Never projected anywhere
 * (see AI_CONTEXT.md "Receitas Recorrentes") — this list is the whole feature surface.
 * Display name is "Receita Recorrente", NOT "Receita Programada" — that label is already taken
 * by the reservoirs feature (/reservoirs). Internal names stay `recurring_incomes`.
 */
export function RecurringIncomesSection({
  incomes,
  categories,
  accounts,
  month,
}: {
  incomes: RecurringIncomeDTO[];
  categories: CategoryDTO[];
  accounts: AccountDTO[];
  month: string;
}) {
  return (
    <Card elevation="sm" className="gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitleWithHelp
          id="budgets.recurring-incomes"
          helpTitle="Receitas recorrentes"
          help={
            <>
              <p>Entradas previsíveis (salário, mesada) pra não refazer o lançamento todo mês.</p>
              <p>Não contam em nenhum gráfico até você tocar em &quot;Registrar&quot; — aí viram uma receita de verdade na conta escolhida.</p>
            </>
          }
        >
          Receitas recorrentes
        </CardTitleWithHelp>
        <RecurringIncomeFormDialog categories={categories} accounts={accounts} />
      </div>

      {incomes.length === 0 ? (
        <p className="text-sm opacity-60">Nenhuma receita recorrente. Cadastre seu salário ou outra entrada fixa pra registrar o recebimento em um clique todo mês.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-divider">
          {incomes.map((income) => (
            <li key={income.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
              <span className="font-medium">{income.name}</span>
              <span className="text-xs opacity-50">dia {income.dayOfMonth}</span>
              {income.categoryName && <span className="text-xs opacity-50">· {income.categoryName}</span>}
              <span className="ml-auto tabular-nums text-success-600">
                {formatCurrency(income.receivedThisMonth ? income.receivedAmount : income.plannedAmount)}
              </span>
              <RegisterReceiptDialog
                income={income}
                accounts={accounts}
                month={month}
                trigger={
                  income.receivedThisMonth ? (
                    <button className="inline-flex items-center gap-1 text-xs text-success-600 hover:opacity-70" aria-label="Ver recebimento">
                      <Badge variant="success"><Check className="size-3" strokeWidth={2} /> Recebido</Badge>
                    </button>
                  ) : (
                    <Button size="sm" variant="secondary">
                      <CircleDollarSign className="size-3.5" strokeWidth={1.5} /> Registrar
                    </Button>
                  )
                }
              />
              <RecurringIncomeFormDialog categories={categories} accounts={accounts} income={income} />
              <DeleteRecurringIncomeButton id={income.id} name={income.name} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
