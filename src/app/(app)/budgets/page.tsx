import { getBudgets, getBudgetTree, getBudgetMonthWindow } from "@/services/budgets.service";
import { getFixedExpenses } from "@/services/fixed-expenses.service";
import { getCategories } from "@/services/categories.service";
import { getAccounts } from "@/services/accounts.service";
import { getTransactionsFiltered } from "@/services/dashboard.service";
import { monthKey, todayIso, startOfMonth, endOfMonth } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";
import { BudgetFormDialog } from "@/features/budgets/components/budget-form-dialog";
import { BudgetTreeEditor } from "@/features/budgets/components/budget-tree-editor";
import { BudgetTree } from "@/features/budgets/components/budget-tree";
import { CloneBudgetButton } from "@/features/budgets/components/clone-budget-button";
import { FixedExpenseFormDialog } from "@/features/budgets/components/fixed-expense-form-dialog";
import { PayFixedExpenseDialog } from "@/features/budgets/components/pay-fixed-expense-dialog";
import { DeactivateBudgetButton } from "@/features/budgets/components/deactivate-budget-button";
import { DeactivateFixedExpenseButton } from "@/features/budgets/components/deactivate-fixed-expense-button";
import { MonthNav } from "@/features/cards/components/month-nav";
import { CreditCard } from "lucide-react";

export default async function BudgetsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const month = resolvedSearchParams.month ?? monthKey(todayIso());
  // Service calls need a full "YYYY-MM-DD" (startOfMonth/endOfMonth require a real day-of-month);
  // `month` itself stays "YYYY-MM" for the MonthNav/searchParams and window comparisons below.
  const monthDate = `${month}-01`;

  const [fixedExpenses, categories, accounts, monthWindow] = await Promise.all([
    getFixedExpenses(monthDate),
    getCategories(),
    getAccounts(),
    getBudgetMonthWindow(),
  ]);
  const [tree, budgets, transactions] = await Promise.all([
    getBudgetTree(monthDate, fixedExpenses),
    getBudgets(monthDate),
    getTransactionsFiltered({ periodStart: startOfMonth(monthDate), periodEnd: endOfMonth(monthDate) }),
  ]);
  // AI_CONTEXT.md "Budgets": only the current real month and the next one (once the current
  // month has a budget) can be created/edited/cloned — every other month is read-only history.
  const isCurrentMonth = month === monthKey(monthWindow.currentMonth);
  const isNextMonth = month === monthKey(monthWindow.nextMonth);
  const isEditableMonth = isCurrentMonth || (isNextMonth && monthWindow.hasCurrentMonthBudget);
  const canClone = isEditableMonth && tree.length === 0 && !!monthWindow.lastRegisteredMonth && monthWindow.lastRegisteredMonth !== startOfMonth(monthDate);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-heading text-2xl font-semibold">Orçamentos e despesas fixas</h1>
        <MonthNav />
      </div>

      {!isEditableMonth && (
        <p className="text-xs opacity-60">
          {isCurrentMonth || isNextMonth
            ? "Este mês ainda não está disponível para planejamento — o mês seguinte só é liberado depois que o mês corrente tiver um orçamento."
            : "Histórico — somente consulta. Só é possível planejar o mês corrente e o próximo."}
        </p>
      )}

      {/* Despesas fixas são perpétuas (não pertencem a um mês específico), então "Nova despesa
          fixa" fica sempre disponível — só as ações de orçamento em si dependem do mês estar
          na janela editável. Uma lista só (a árvore) em vez de abas separadas: despesa fixa já
          aparece aninhada dentro da categoria/subcategoria dela, decidido 2026-08-08. */}
      <div className="flex flex-wrap justify-end gap-2">
        {isEditableMonth && canClone && <CloneBudgetButton fromMonth={monthWindow.lastRegisteredMonth!} toMonth={monthDate} />}
        {isEditableMonth && <BudgetTreeEditor categories={categories} budgets={budgets} fixedExpenses={fixedExpenses} month={monthDate} />}
        <FixedExpenseFormDialog categories={categories} accounts={accounts} />
        {isEditableMonth && <BudgetFormDialog categories={categories} month={monthDate} />}
      </div>

      <BudgetTree
        categories={tree}
        transactions={transactions}
        renderCategoryActions={
          isEditableMonth
            ? (c) => (
                <div className="flex items-center gap-2">
                  <BudgetFormDialog
                    categories={categories}
                    month={monthDate}
                    budget={{ id: c.budget!.id, categoryId: c.categoryId, subcategoryId: undefined, plannedAmount: c.budget!.plannedAmount }}
                  />
                  {/* A budget with direct fixed expenses can't be deleted, only raised — deleting it would orphan their floor (AI_CONTEXT.md "Budget hierarchy"). */}
                  {c.directFixedExpenses.length === 0 && (
                    <DeactivateBudgetButton budgetId={c.budget!.id} label={c.categoryName} />
                  )}
                </div>
              )
            : undefined
        }
        renderSubcategoryActions={
          isEditableMonth
            ? (c, s) => (
                <div className="flex items-center gap-2">
                  <BudgetFormDialog
                    categories={categories}
                    month={monthDate}
                    budget={{ id: s.budgetId, categoryId: c.categoryId, subcategoryId: s.subcategoryId, plannedAmount: s.plannedAmount }}
                  />
                  {s.fixedExpenses.length === 0 && (
                    <DeactivateBudgetButton budgetId={s.budgetId} label={`${c.categoryName} · ${s.subcategoryName}`} />
                  )}
                </div>
              )
            : undefined
        }
        renderFixedExpenseActions={(f) => (
          <div className="flex items-center gap-2">
            <PayFixedExpenseDialog
              expense={f}
              accounts={accounts}
              month={monthDate}
              trigger={
                <button
                  className={cn(
                    "p-1.5 -m-1.5",
                    f.isPaidThisMonth ? "text-success-600 hover:text-success-600/70" : "text-text/40 hover:text-accent"
                  )}
                  aria-label={f.isPaidThisMonth ? "Ver pagamento" : "Registrar pagamento"}
                >
                  <CreditCard className="size-3.5" strokeWidth={1.5} />
                </button>
              }
            />
            <FixedExpenseFormDialog categories={categories} accounts={accounts} expense={f} />
            <DeactivateFixedExpenseButton fixedExpenseId={f.id} name={f.name} />
          </div>
        )}
      />
    </div>
  );
}
