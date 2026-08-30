import { parseDashboardFilters, type DashboardSearchParams } from "@/features/dashboard/filters";
import { startOfMonth, endOfMonth, addMonthsToIsoDate, monthKey } from "@/lib/utils/date";
import {
  getFinancialSummary,
  getMonthlyEvolution,
  getCategoryDistribution,
  getTransactionsFiltered,
  getCurrentMonthObligations,
  getDefaultDashboardMonth,
} from "@/services/dashboard.service";
import { getAccounts } from "@/services/accounts.service";
import { getCategories } from "@/services/categories.service";
import { getBudgetTree } from "@/services/budgets.service";
import { getFixedExpenses } from "@/services/fixed-expenses.service";
import { getDebts } from "@/services/debts.service";
import { getGoalsOverview } from "@/services/goals.service";
import type { DashboardFilters as DashboardFiltersType } from "@/types/dto";

import { DashboardFilters } from "@/features/dashboard/components/dashboard-filters";
import { SummaryCards } from "@/features/dashboard/components/summary-cards";
import { MonthlyChart } from "@/features/dashboard/components/monthly-chart";
import { CategoryPie } from "@/features/dashboard/components/category-pie";
import { ExpenseSourceToggle } from "@/features/dashboard/components/expense-source-toggle";
import { BudgetsPanel } from "@/features/dashboard/components/budgets-panel";
import { MonthObligationsCard } from "@/features/dashboard/components/month-obligations-card";
import { GoalsOverview } from "@/features/dashboard/components/goals-overview";
import { HelpButton } from "@/components/ui/help-button";
import { TransactionExplorer } from "@/features/dashboard/components/transaction-explorer";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<DashboardSearchParams>;
}) {
  const resolvedSearchParams = await searchParams;

  // When the user hasn't explicitly picked a month (no `?month=`), auto-resolve which month to
  // open on — same practicality logic as /cards: if every expense of the current month is
  // already paid, jump to next month, unless next month has nothing to show.
  const autoMonth = !resolvedSearchParams.month ? await getDefaultDashboardMonth() : undefined;

  const filters = parseDashboardFilters(
    autoMonth ? { ...resolvedSearchParams, month: autoMonth } : resolvedSearchParams
  );
  const viewedMonth = monthKey(filters.periodEnd);

  // Evolução mensal sempre mostra 12 meses no passado + 3 no futuro (a partir do mês
  // visualizado) — um único mês de barra não conta uma evolução, e os 3 meses futuros mostram
  // parcelas de cartão já agendadas (competence futura já existe em card_installments). Herda o
  // mesmo filtro de categoria/conta/tipo do resto da página. As despesas projetadas não pagas
  // (ver `viewedMonth` passado aos serviços abaixo) entram só na barra do mês visualizado.
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
    incomeDistribution,
    transactions,
    accounts,
    categories,
    fixedExpenses,
    debts,
    monthObligations,
    goalsOverview,
  ] = await Promise.all([
    getFinancialSummary(filters, viewedMonth),
    getMonthlyEvolution(monthlyEvolutionFilters, viewedMonth),
    getCategoryDistribution(expenseFilters, viewedMonth),
    getCategoryDistribution(incomeFilters, viewedMonth),
    getTransactionsFiltered(filters),
    getAccounts(),
    getCategories(),
    // Reflects the filtered period, not always "today" — a user browsing a past/future
    // month via the filters expects the budgets/fixed-expenses panel to follow along.
    getFixedExpenses(filters.periodEnd),
    getDebts(),
    getCurrentMonthObligations(viewedMonth),
    getGoalsOverview(),
  ]);
  const budgetTree = await getBudgetTree(filters.periodEnd, fixedExpenses);

  // Quando o usuário filtra por uma categoria que é claramente só de despesa (ou só de receita),
  // o donut do outro lado fica vazio — não faz sentido mostrar um gráfico "Sem lançamentos".
  // Só escondemos o lado vazio quando o outro tem dados, pra sempre sobrar ao menos um donut
  // (com seu botão de limpar filtro) na tela.
  const hasCategoryFilter = Boolean(
    filters.categories?.length || filters.subcategories?.length || filters.uncategorizedOnly
  );
  const showExpensePie = !hasCategoryFilter || expenseDistribution.length > 0 || incomeDistribution.length === 0;
  const showIncomePie = !hasCategoryFilter || incomeDistribution.length > 0 || expenseDistribution.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="font-heading text-2xl font-semibold">Dashboard</h1>
          <HelpButton title="Dashboard">
            <p>Visão geral do período: quanto entrou, quanto saiu, e como isso se distribui por categoria.</p>
            <p>Use a navegação de mês, a conta ou o filtro de categoria — marque o grupo Receitas ou Despesas pra ver só um lado — e clique numa fatia do gráfico pra filtrar por ela.</p>
          <p>As despesas incluem também as despesas programadas e os parcelamentos ainda não pagos do mês, além do que já foi lançado.</p>
            <p>Cada linha do Explorador de Lançamentos pode ser editada direto ali, sem abrir outra tela.</p>
          </HelpButton>
        </div>
        <DashboardFilters month={viewedMonth} accounts={accounts} categories={categories} />
      </div>

      <SummaryCards summary={summary} />

      {/* "Despesas de {mês}" lista compromissos do mês inteiro (faturas, despesas programadas,
          dívidas) — não é filtrável por categoria, então esconde quando há filtro de categoria
          ativo pra não conflitar com o resto da tela já filtrada. */}
      {!hasCategoryFilter && (
        <MonthObligationsCard
          data={monthObligations}
          accounts={accounts}
          categories={categories}
          fixedExpenses={fixedExpenses}
          debts={debts}
        />
      )}

      {/* Bloco de Metas — donuts compactos + status. Some sob filtro de categoria, igual o card
          de despesas do mês (não é filtrável por categoria). */}
      {!hasCategoryFilter && <GoalsOverview data={goalsOverview} />}

      <MonthlyChart data={monthlyEvolution} />

      {(showExpensePie || showIncomePie) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {showExpensePie && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-heading text-lg font-semibold">Despesas por categoria</h2>
                <ExpenseSourceToggle />
              </div>
              <CategoryPie data={expenseDistribution} title="Distribuição de despesas" />
            </div>
          )}

          {showIncomePie && (
            <div className="flex flex-col gap-2">
              <h2 className="font-heading text-lg font-semibold">Receitas por categoria</h2>
              <CategoryPie data={incomeDistribution} title="Distribuição de receitas" />
            </div>
          )}
        </div>
      )}

      <BudgetsPanel categories={budgetTree} />

      <TransactionExplorer transactions={transactions} categories={categories} accounts={accounts} />
    </div>
  );
}
