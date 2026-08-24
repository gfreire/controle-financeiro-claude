import { parseDashboardFilters, type DashboardSearchParams } from "@/features/dashboard/filters";
import { startOfMonth, endOfMonth, addMonthsToIsoDate, monthKey, todayIso } from "@/lib/utils/date";
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
import { getDebts } from "@/services/debts.service";
import { sumMoney } from "@/lib/utils/money";
import type { DashboardFilters as DashboardFiltersType } from "@/types/dto";

import { DashboardFilters } from "@/features/dashboard/components/dashboard-filters";
import { SummaryCards } from "@/features/dashboard/components/summary-cards";
import { MonthlyChart } from "@/features/dashboard/components/monthly-chart";
import { CategoryPie } from "@/features/dashboard/components/category-pie";
import { CategoryBars } from "@/features/dashboard/components/category-bars";
import { ExpenseSourceToggle } from "@/features/dashboard/components/expense-source-toggle";
import { BudgetsPanel } from "@/features/dashboard/components/budgets-panel";
import { UpcomingDueAlert } from "@/features/dashboard/components/upcoming-due-alert";
import { OpenDebtsAlert } from "@/features/dashboard/components/open-debts-alert";
import { HelpButton } from "@/components/ui/help-button";
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
    debts,
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
    getDebts(),
  ]);
  const budgetTree = await getBudgetTree(filters.periodEnd, fixedExpenses);
  const liquidAccounts = accounts.filter((a) => a.type !== "CREDIT_CARD");

  // "Dívidas em aberto" (AI_CONTEXT.md "Dívidas — subtipos") — só OVERDUE_BILL/INSTALLMENT_PLAN
  // PAYABLE contam aqui; PERSONAL nunca afeta o dashboard (Money Reality Rules). Não é escopado
  // por período — é um compromisso em aberto, não um evento datado, então independe do filtro.
  const openDebts = debts.filter((d) => d.side === "PAYABLE" && d.kind !== "PERSONAL");
  const totalOpenDebts = sumMoney(openDebts.map((d) => d.remainingBalance));

  // "Vence essa semana" is always anchored to today's real month, never the viewed-period filter
  // (see UpcomingDueAlert) — reuse the already-fetched list when the viewed month IS today's month
  // instead of firing a redundant second query.
  const todaysFixedExpenses =
    monthKey(filters.periodEnd) === monthKey(todayIso()) ? fixedExpenses : await getFixedExpenses(todayIso());

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="font-heading text-2xl font-semibold">Dashboard</h1>
          <HelpButton title="Dashboard">
            <p>Visão geral do período: quanto entrou, quanto saiu, e como isso se distribui por categoria.</p>
            <p>Use os filtros pra mudar o período, a conta ou o tipo — e clique numa fatia do gráfico ou numa categoria pra filtrar por ela.</p>
            <p>Cada linha do Explorador de Lançamentos pode ser editada direto ali, sem abrir outra tela.</p>
          </HelpButton>
        </div>
        <DashboardFilters preset={filters.preset} accounts={accounts} categories={categories} />
      </div>

      <UpcomingDueAlert fixedExpenses={todaysFixedExpenses} />
      <OpenDebtsAlert debts={openDebts} totalOpenDebts={totalOpenDebts} accounts={liquidAccounts} categories={categories} />

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
