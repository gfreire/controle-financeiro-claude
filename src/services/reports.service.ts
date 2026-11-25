import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/getUser";
import { addMoney, subtractMoney, sumMoney } from "@/lib/utils/money";
import { addMonthsToIsoDate, endOfMonth, formatMonthLabel, monthKey, resolvePeriodPreset, startOfMonth, todayIso } from "@/lib/utils/date";
import { getDebts } from "./debts.service";
import type { ReportInput } from "@/lib/validations/reports";
import type { ReportRow } from "@/types/database";
import type {
  DashboardFilters,
  DebtDTO,
  MonthlyEvolutionDTO,
  ReportChartPointDTO,
  ReportChartSeriesDTO,
  ReportDTO,
  ReportGranularity,
  ReportPeriodPreset,
} from "@/types/dto";

/**
 * Relatórios salvos (/reports, migration 0042). The table only stores a filter definition; every
 * figure on a report is recomputed on open through the same dashboard.service functions the
 * dashboard uses — reports are "the dashboard with a saved, richer filter", never a second
 * aggregation engine. See AI_CONTEXT.md "Relatórios".
 */

function toDTO(row: ReportRow): ReportDTO {
  return {
    id: row.id,
    name: row.name,
    periodPreset: row.period_preset as ReportPeriodPreset,
    periodStart: row.period_start ?? undefined,
    periodEnd: row.period_end ?? undefined,
    cardBasis: row.card_basis,
    includeProjections: row.include_projections,
    categoryIds: row.category_ids ?? [],
    subcategoryIds: row.subcategory_ids ?? [],
    accountIds: row.account_ids ?? [],
    descriptionSearch: row.description_search ?? undefined,
  };
}

function toRow(input: ReportInput) {
  const custom = input.periodPreset === "custom";
  return {
    name: input.name,
    period_preset: input.periodPreset,
    period_start: custom ? input.periodStart : null,
    period_end: custom ? input.periodEnd : null,
    card_basis: input.cardBasis,
    include_projections: input.includeProjections,
    category_ids: input.categoryIds,
    subcategory_ids: input.subcategoryIds,
    account_ids: input.accountIds,
    description_search: input.descriptionSearch || null,
  };
}

export async function getReports(): Promise<ReportDTO[]> {
  const supabase = await createClient();
  const user = await getUser();
  const { data, error } = await supabase.from("reports").select("*").eq("user_id", user.id).order("name");
  if (error) throw new Error(error.message);
  return ((data ?? []) as ReportRow[]).map(toDTO);
}

export async function getReport(id: string): Promise<ReportDTO | null> {
  const supabase = await createClient();
  const user = await getUser();
  const { data, error } = await supabase.from("reports").select("*").eq("user_id", user.id).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toDTO(data as ReportRow) : null;
}

export async function createReport(input: ReportInput): Promise<string> {
  const supabase = await createClient();
  const user = await getUser();
  const { data, error } = await supabase
    .from("reports")
    .insert({ user_id: user.id, ...toRow(input) })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function updateReport(id: string, input: ReportInput): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const { error } = await supabase
    .from("reports")
    .update({ ...toRow(input), updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Hard delete — a report holds no history of its own (it's just a saved filter). */
export async function deleteReport(id: string): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const { error } = await supabase.from("reports").delete().eq("user_id", user.id).eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * "Todo o período" bounds: from the user's earliest analytic row to the latest one — which can be
 * in the future (installments / card credits by competence). The end is never before the end of
 * the current month (so this month's unpaid projections count) nor before the last competence of
 * any still-open Parcelamento Programado (so its remaining installments show as "ainda a
 * realizar" — the "dívida parcelada que ainda falta pagar" case). Falls back to the current month
 * when the user has no data at all.
 */
async function getAllTimeBounds(): Promise<{ periodStart: string; periodEnd: string }> {
  const supabase = await createClient();
  const user = await getUser();
  const edge = async (table: "transactions" | "card_purchases" | "card_installments" | "card_refunds", column: string, ascending: boolean) => {
    let query = supabase.from(table).select(column).order(column, { ascending }).limit(1);
    if (table !== "card_installments") query = query.eq("user_id", user.id);
    if (table === "transactions") query = query.in("type", ["INCOME", "EXPENSE"]);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const row = (data as unknown as Array<Record<string, string>> | null)?.[0];
    return row?.[column];
  };
  const [txMin, txMax, purchaseMin, purchaseMax, instMin, instMax, refundMin, refundMax, debts] = await Promise.all([
    edge("transactions", "date", true),
    edge("transactions", "date", false),
    edge("card_purchases", "purchase_date", true),
    edge("card_purchases", "purchase_date", false),
    edge("card_installments", "competence", true),
    edge("card_installments", "competence", false),
    edge("card_refunds", "competence", true),
    edge("card_refunds", "competence", false),
    getDebts(),
  ]);
  const mins = [txMin, purchaseMin, instMin, refundMin].filter((v): v is string => Boolean(v)).sort();
  if (!mins.length) return resolvePeriodPreset("month");
  const planEnds = debts.filter((d) => d.kind === "INSTALLMENT_PLAN" && d.monthlyAmount).map(installmentPlanLastMonth);
  const maxes = [txMax, purchaseMax, instMax, refundMax, todayIso(), ...planEnds]
    .filter((v): v is string => Boolean(v))
    .sort();
  return { periodStart: startOfMonth(mins[0]), periodEnd: endOfMonth(maxes[maxes.length - 1]) };
}

/** Last competence ("YYYY-MM-01") an open Parcelamento Programado still has to be paid in. */
function installmentPlanLastMonth(debt: DebtDTO): string {
  const nextOpen = debt.paidThroughCompetence
    ? addMonthsToIsoDate(`${debt.paidThroughCompetence}-01`, 1)
    : `${debt.startCompetence ?? monthKey(todayIso())}-01`;
  const remaining = Math.max(1, Math.ceil(debt.remainingBalance / (debt.monthlyAmount ?? debt.remainingBalance)));
  return addMonthsToIsoDate(nextOpen, remaining - 1);
}

/** The concrete dates a report covers today — relative presets are re-resolved on every open. */
export async function resolveReportPeriod(report: Pick<ReportDTO, "periodPreset" | "periodStart" | "periodEnd">) {
  if (report.periodPreset === "custom" && report.periodStart && report.periodEnd) {
    return { periodStart: report.periodStart, periodEnd: report.periodEnd };
  }
  if (report.periodPreset === "all") return getAllTimeBounds();
  return resolvePeriodPreset(report.periodPreset);
}

/**
 * The DashboardFilters a report runs with. `drillCategoryIds` (a click on a donut slice, carried
 * in `?categories=`) temporarily narrows the saved category list without touching the saved report.
 */
export function buildReportFilters(
  report: ReportDTO,
  period: { periodStart: string; periodEnd: string },
  drillCategoryIds?: string[]
): DashboardFilters {
  const categories = drillCategoryIds?.length ? drillCategoryIds.filter((id) => id !== "uncategorized") : report.categoryIds;
  return {
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    categories: categories.length ? categories : undefined,
    uncategorizedOnly: drillCategoryIds?.includes("uncategorized") || undefined,
    subcategories: report.subcategoryIds.length ? report.subcategoryIds : undefined,
    accounts: report.accountIds.length ? report.accountIds : undefined,
    descriptionSearch: report.descriptionSearch || undefined,
    cardBasis: report.cardBasis,
  };
}

/**
 * Months whose unpaid obligations (despesas programadas / parcelamentos não pagos) get projected
 * into a report — same projection as the dashboard, limited to the CURRENT real month onward and
 * to months whose 1st day lies inside the period. Past months are left out on purpose: a long
 * report ("últimos 12 meses", "todo o período") would otherwise pile up a placeholder for every
 * past month a fixed expense wasn't logged, which is noise for a report, not a forecast.
 */
export function getReportProjectionMonths(report: ReportDTO, period: { periodStart: string; periodEnd: string }): string[] {
  if (!report.includeProjections) return [];
  const currentMonth = monthKey(todayIso());
  const months: string[] = [];
  let cursor = monthKey(period.periodStart);
  const last = monthKey(period.periodEnd);
  while (cursor <= last) {
    if (cursor >= currentMonth && `${cursor}-01` >= period.periodStart) months.push(cursor);
    cursor = monthKey(addMonthsToIsoDate(`${cursor}-01`, 1));
  }
  return months;
}

/** Month-key → short labels per granularity: "Nov/26", "T4/26", "2026". */
function compactMonthLabel(key: string): string {
  return formatMonthLabel(key, true).replace(/\/(\d{2})(\d{2})$/, "/$2");
}
function bucketKey(key: string, granularity: ReportGranularity): string {
  if (granularity === "month") return key;
  const year = key.slice(0, 4);
  if (granularity === "year") return year;
  return `T${Math.ceil(Number(key.slice(5, 7)) / 3)}/${year.slice(2)}`;
}

/**
 * Every chart series a report needs, ready to draw — per granularity (mês / trimestre / ano), each
 * point with income/expense/reserved, the period result and its running total ("quanto já
 * ganhei/perdi até aqui"). `evolution` is getMonthlyEvolution's output over `period`, one entry per
 * month from period.periodStart.
 *
 * Leading and trailing months with nothing at all are trimmed — "Todo o período" spans the user's
 * whole history, but a "Poker" report only has data in a few of those months; a run of empty bars
 * around it is noise. Empty months *between* data stay (a zero month is information). The running
 * total is unaffected (trimmed months are all zero).
 *
 * `defaultGranularity` picks a readable bar count: month up to 18 months, quarter up to 60, else year.
 */
export function getReportChartSeries(
  evolution: MonthlyEvolutionDTO[],
  period: { periodStart: string }
): ReportChartSeriesDTO {
  const firstMonth = `${monthKey(period.periodStart)}-01`;
  const months = evolution.map((point, i) => ({ ...point, key: monthKey(addMonthsToIsoDate(firstMonth, i)) }));
  const hasData = (p: MonthlyEvolutionDTO) => p.income !== 0 || p.expense !== 0 || p.reserved !== 0;
  const first = months.findIndex(hasData);
  const last = months.length - 1 - [...months].reverse().findIndex(hasData);
  const trimmed = first === -1 ? months.slice(-1) : months.slice(first, last + 1);

  const build = (granularity: ReportGranularity): ReportChartPointDTO[] => {
    const buckets = new Map<string, { label: string; income: number[]; expense: number[]; reserved: number[] }>();
    for (const m of trimmed) {
      const key = bucketKey(m.key, granularity);
      const bucket = buckets.get(key) ?? {
        label: granularity === "month" ? compactMonthLabel(m.key) : key,
        income: [],
        expense: [],
        reserved: [],
      };
      bucket.income.push(m.income);
      bucket.expense.push(m.expense);
      bucket.reserved.push(m.reserved);
      buckets.set(key, bucket);
    }
    let cumulative = 0;
    return [...buckets.values()].map((b) => {
      const income = sumMoney(b.income);
      const expense = sumMoney(b.expense);
      const result = subtractMoney(income, expense);
      cumulative = addMoney(cumulative, result);
      return { month: b.label, income, expense, reserved: sumMoney(b.reserved), result, cumulative };
    });
  };

  const monthCount = trimmed.length;
  return {
    month: build("month"),
    quarter: build("quarter"),
    year: build("year"),
    monthCount,
    defaultGranularity: monthCount <= 18 ? "month" : monthCount <= 60 ? "quarter" : "year",
  };
}

/**
 * The dashboard's evolution chart always shows the "Guardado (metas)" flow, which carries no
 * category or description. On a report narrowed by category/subcategory/description that bar has
 * nothing to do with what's being looked at ("Poker" never sets money aside), so it's zeroed —
 * MonthlyChart hides the bar when every month is 0.
 */
export function prepareReportEvolution(evolution: MonthlyEvolutionDTO[], filters: DashboardFilters): MonthlyEvolutionDTO[] {
  const narrowed = Boolean(filters.categories?.length || filters.subcategories?.length || filters.descriptionSearch || filters.uncategorizedOnly);
  return narrowed ? evolution.map((point) => ({ ...point, reserved: 0 })) : evolution;
}
