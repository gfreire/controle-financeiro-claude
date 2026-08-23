import { parseDashboardFilters, type DashboardSearchParams } from "@/features/dashboard/filters";
import { startOfMonth, endOfMonth, addMonthsToIsoDate } from "@/lib/utils/date";
import {
  getFinancialSummary,
  getMonthlyEvolution,
  getCategoryDistribution,
  getCategoryComparison,
  getTransactionsFiltered,
} from "@/services/dashboard.service";
import { getAccounts } from "@/services/accounts.service";
import { getCategories } from "@/services/categories.service";
import { getBudgetTree } from "@/services/budgets.service";
import { getFixedExpenses } from "@/services/fixed-expenses.service";
import type { DashboardFilters as DashboardFiltersType } from "@/types/dto";

import { DashboardFilters } from "@/features/dashboard/components/dashboard-filters";
import { SummaryCards } from "@/features/dashboard/components/summary-cards";
import { MonthlyChart } from "@/features/dashboard/components/monthly-chart";
import { CategoryPie } from "@/features/dashboard/components/category-pie";
import { CategoryBars } from "@/features/dashboard/components/category-bars";
import { ExpenseSourceToggle } from "@/features/dashboard/components/expense-source-toggle";
import { BudgetsPanel } from "@/features/dashboard/components/budgets-panel";
import { TransactionExplorer } from "@/features/dashboard/components/transaction-explorer";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<DashboardSearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const filters = parseDashboardFilters(resolvedSearchParams);

  // Evolução mensal sempre mostra 12 meses no passado + 3 no futuro (a partir do mês de
  // referência visualizado), independente do preset de período do resto do dashboard — um único
  // mês de barra não conta uma evolução, e os 3 meses futuros mostram parcelas de cartão já
  // agendadas (competence futura já existe em card_installments). Herda o mesmo filtro de
  // categoria/conta/tipo do resto da página.
  const referenceMonthStart = startOfMonth(filters.periodEnd);
  const monthlyEvolutionFilters: DashboardFiltersType = {
    ...filters,
    periodStart: startOfMonth(addMonthsToIsoDate(referenceMonthStart, -11)),
    periodEnd: endOfMonth(addMonthsToIsoDate(referenceMonthStart, 3)),
  };

  // Despesas e Receitas por categoria são pares independentes (donut + comparativo), cada um
  // forçando seu próprio transactionType — ignoram deliberadamente o filtro global "Tipo" para
  // sempre mostrar os dois lados lado a lado. "expenseSource" segmenta só o par de despesas por
  // tipo de conta (Dinheiro+Banco vs. Cartões), ver ExpenseSourceToggle/DashboardFilters.source.
  const expenseSourceParam = resolvedSearchParams.expenseSource;
  const expenseSource: DashboardFiltersType["source"] =
    expenseSourceParam === "liquid" || expenseSourceParam === "cards" ? expenseSourceParam : "all";
  const expenseFilters: DashboardFiltersType = { ...filters, transactionType: "EXPENSE", source: expenseSource };
  const incomeFilters: DashboardFiltersType = { ...filters, transactionType: "INCOME" };

  const [
    summary,
    monthlyEvolution,
    expenseDistribution,
    expenseComparison,
    incomeDistribution,
    incomeComparison,
    transactions,
    accounts,
    categories,
    fixedExpenses,
  ] = await Promise.all([
    getFinancialSummary(filters),
    getMonthlyEvolution(monthlyEvolutionFilters),
    getCategoryDistribution(expenseFilters),
    getCategoryComparison(expenseFilters),
    getCategoryDistribution(incomeFilters),
    getCategoryComparison(incomeFilters),
    getTransactionsFiltered(filters),
    getAccounts(),
    getCategories(),
    // Reflects the filtered period, not always "today" — a user browsing a past/future
    // month via the filters expects the budgets/fixed-expenses panel to follow along.
    getFixedExpenses(filters.periodEnd),
  ]);
  const budgetTree = await getBudgetTree(filters.periodEnd, fixedExpenses);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold">Dashboard</h1>
        <DashboardFilters preset={filters.preset} accounts={accounts} categories={categories} />
      </div>

      <SummaryCards summary={summary} />

      <MonthlyChart data={monthlyEvolution} />

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-lg font-semibold">Despesas por categoria</h2>
          <ExpenseSourceToggle />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <CategoryPie data={expenseDistribution} title="Distribuição de despesas" />
          <CategoryBars data={expenseComparison} title="Comparativo de despesas" />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-semibold">Receitas por categoria</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <CategoryPie data={incomeDistribution} title="Distribuição de receitas" />
          <CategoryBars data={incomeComparison} title="Comparativo de receitas" />
        </div>
      </div>

      <BudgetsPanel categories={budgetTree} />

      <TransactionExplorer transactions={transactions} categories={categories} accounts={accounts} />
    </div>
  );
}
