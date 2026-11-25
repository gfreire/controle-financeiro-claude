import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  buildReportFilters,
  getReport,
  getReportProjectionMonths,
  getReportChartSeries,
  prepareReportEvolution,
  resolveReportPeriod,
} from "@/services/reports.service";
import {
  getCategoryDistribution,
  getFinancialSummary,
  getFutureSummary,
  getMonthlyEvolution,
  getTransactionsFiltered,
} from "@/services/dashboard.service";
import { getAccounts } from "@/services/accounts.service";
import { getCategories } from "@/services/categories.service";
import { formatDate } from "@/lib/utils/date";
import { Badge } from "@/components/ui/badge";
import { HelpButton } from "@/components/ui/help-button";
import { HelpHint } from "@/components/ui/help-hint";
import { CategoryPie } from "@/features/dashboard/components/category-pie";
import { TransactionExplorer } from "@/features/dashboard/components/transaction-explorer";
import { ReportFormDialog } from "@/features/reports/components/report-form-dialog";
import { DeleteReportButton } from "@/features/reports/components/delete-report-button";
import { ReportSummaryCards } from "@/features/reports/components/report-summary-cards";
import { ReportCharts } from "@/features/reports/components/report-charts";
import { CARD_BASIS_LABELS, describeReportPeriod } from "@/features/reports/period-labels";
import type { DashboardFilters } from "@/types/dto";

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  /** `categories` = a donut-slice drill-down on top of the saved filter (never saved). */
  searchParams: Promise<{ categories?: string }>;
}) {
  const [{ id }, { categories: drillParam }] = await Promise.all([params, searchParams]);
  const report = await getReport(id);
  if (!report) notFound();

  const period = await resolveReportPeriod(report);
  const drillCategoryIds = drillParam ? drillParam.split(",").filter(Boolean) : undefined;
  const filters = buildReportFilters(report, period, drillCategoryIds);
  const projectionMonths = getReportProjectionMonths(report, period);
  const expenseFilters: DashboardFilters = { ...filters, transactionType: "EXPENSE" };
  const incomeFilters: DashboardFilters = { ...filters, transactionType: "INCOME" };

  const [summary, future, evolution, expenseDistribution, incomeDistribution, transactions, accounts, categories] = await Promise.all([
    getFinancialSummary(filters, projectionMonths),
    getFutureSummary(filters, projectionMonths),
    getMonthlyEvolution(filters, projectionMonths),
    getCategoryDistribution(expenseFilters, projectionMonths),
    getCategoryDistribution(incomeFilters, projectionMonths),
    getTransactionsFiltered(filters, { installmentDate: "due" }),
    getAccounts(),
    getCategories(),
  ]);
  const monthlyEvolution = prepareReportEvolution(evolution, filters);
  const chartSeries = getReportChartSeries(monthlyEvolution, period);

  const categoryName = new Map(categories.map((c) => [c.id, `${c.icon ?? ""} ${c.name}`.trim()]));
  const subcategoryName = new Map(categories.flatMap((c) => c.subcategories.map((s) => [s.id, s.name] as const)));
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const chips = [
    ...report.categoryIds.map((cid) => categoryName.get(cid)),
    ...report.subcategoryIds.map((sid) => subcategoryName.get(sid)),
    ...report.accountIds.map((aid) => accountName.get(aid)),
  ].filter(Boolean) as string[];

  // Same rule as the dashboard: with a category filter, hide the side that came out empty (as long
  // as the other side has data), so a "Poker saídas"-only report doesn't show an empty income donut.
  const hasCategoryFilter = Boolean(filters.categories?.length || filters.subcategories?.length || filters.uncategorizedOnly);
  const showExpensePie = !hasCategoryFilter || expenseDistribution.length > 0 || incomeDistribution.length === 0;
  const showIncomePie = !hasCategoryFilter || incomeDistribution.length > 0 || expenseDistribution.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link href="/reports" className="inline-flex items-center gap-1 text-xs text-text/60 hover:text-accent">
            <ArrowLeft className="size-3.5" strokeWidth={1.5} /> Relatórios
          </Link>
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-2xl font-semibold">{report.name}</h1>
            <HelpButton title="Relatório">
              <p>Os gráficos usam os filtros salvos neste relatório. Clique numa fatia do gráfico de categorias para olhar só ela — isso não altera o relatório salvo.</p>
              <p>Use “Editar filtros” para mudar período, categorias, contas, descrição ou como as compras no cartão são contadas.</p>
            </HelpButton>
          </div>
          <p className="text-sm text-text/70">
            {describeReportPeriod(report)}
            {report.periodPreset !== "custom" && ` · ${formatDate(period.periodStart)} – ${formatDate(period.periodEnd)}`}
          </p>
          <div className="flex flex-wrap gap-1">
            {chips.length === 0 && <Badge>Todas as categorias e contas</Badge>}
            {chips.map((label) => <Badge key={label}>{label}</Badge>)}
            {report.descriptionSearch && <Badge>Descrição contém “{report.descriptionSearch}”</Badge>}
            <Badge>{CARD_BASIS_LABELS[report.cardBasis]}</Badge>
            {report.includeProjections && projectionMonths.length > 0 && <Badge>Com despesas previstas</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ReportFormDialog report={report} categories={categories} accounts={accounts} />
          <DeleteReportButton reportId={report.id} name={report.name} />
        </div>
      </div>

      <ReportSummaryCards summary={summary} future={future} />

      <ReportCharts series={chartSeries} />

      {(showExpensePie || showIncomePie) && (
        <div className={showExpensePie && showIncomePie ? "grid grid-cols-1 gap-4 lg:grid-cols-2" : "grid grid-cols-1 gap-4"}>
          {showExpensePie && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5">
                <h2 className="font-heading text-lg font-semibold">Despesas por categoria</h2>
                <HelpHint id="reports.expense-donut" title="Despesas por categoria">
                  <p>Pra onde foi o dinheiro no período. Clique numa fatia pra olhar só ela.</p>
                </HelpHint>
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

      <TransactionExplorer transactions={transactions} categories={categories} accounts={accounts} />
    </div>
  );
}
