import { parseDashboardFilters, type DashboardSearchParams } from "@/features/dashboard/filters";
import {
  getFinancialSummary,
  getMonthlyEvolution,
  getCategoryDistribution,
  getCategoryComparison,
  getTransactionsFiltered,
} from "@/services/dashboard.service";
import { getAccounts } from "@/services/accounts.service";
import { getCategories } from "@/services/categories.service";
import { getBudgets } from "@/services/budgets.service";
import { getFixedExpenses } from "@/services/fixed-expenses.service";
import { todayIso } from "@/lib/utils/date";

import { DashboardFilters } from "@/features/dashboard/components/dashboard-filters";
import { SummaryCards } from "@/features/dashboard/components/summary-cards";
import { IncomeExpenseChart } from "@/features/dashboard/components/income-expense-chart";
import { MonthlyChart } from "@/features/dashboard/components/monthly-chart";
import { CategoryPie } from "@/features/dashboard/components/category-pie";
import { CategoryBars } from "@/features/dashboard/components/category-bars";
import { BudgetsPanel } from "@/features/dashboard/components/budgets-panel";
import { TransactionExplorer } from "@/features/dashboard/components/transaction-explorer";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<DashboardSearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const filters = parseDashboardFilters(resolvedSearchParams);

  const [summary, monthlyEvolution, categoryDistribution, categoryComparison, transactions, accounts, categories, budgets, fixedExpenses] =
    await Promise.all([
      getFinancialSummary(filters),
      getMonthlyEvolution(filters),
      getCategoryDistribution(filters),
      getCategoryComparison(filters),
      getTransactionsFiltered(filters),
      getAccounts(),
      getCategories(),
      getBudgets(todayIso()),
      getFixedExpenses(todayIso()),
    ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold">Dashboard</h1>
        <DashboardFilters preset={filters.preset} accounts={accounts} categories={categories} />
      </div>

      <SummaryCards summary={summary} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <IncomeExpenseChart summary={summary} />
        <MonthlyChart data={monthlyEvolution} />
        <CategoryPie data={categoryDistribution} />
        <CategoryBars data={categoryComparison} />
      </div>

      <BudgetsPanel budgets={budgets} fixedExpenses={fixedExpenses} />

      <TransactionExplorer transactions={transactions} categories={categories} />
    </div>
  );
}
