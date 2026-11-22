import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/getUser";
import { addMoney, subtractMoney } from "@/lib/utils/money";
import { addMonthsToIsoDate, endOfMonth, monthKey, resolvePeriodPreset, startOfMonth, todayIso } from "@/lib/utils/date";
import type { ReportInput } from "@/lib/validations/reports";
import type { ReportRow } from "@/types/database";
import type { DashboardFilters, MonthlyEvolutionDTO, ReportDTO, ReportPeriodPreset, ReportResultPointDTO } from "@/types/dto";

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
 * in the future (installments by competence). Looks at transactions, card purchase dates and
 * installment competences; falls back to the current month when the user has no data at all.
 */
async function getAllTimeBounds(): Promise<{ periodStart: string; periodEnd: string }> {
  const supabase = await createClient();
  const user = await getUser();
  const edge = async (table: "transactions" | "card_purchases" | "card_installments", column: string, ascending: boolean) => {
    let query = supabase.from(table).select(column).order(column, { ascending }).limit(1);
    if (table !== "card_installments") query = query.eq("user_id", user.id);
    if (table === "transactions") query = query.in("type", ["INCOME", "EXPENSE"]);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const row = (data as unknown as Array<Record<string, string>> | null)?.[0];
    return row?.[column];
  };
  const [txMin, txMax, purchaseMin, purchaseMax, instMin, instMax] = await Promise.all([
    edge("transactions", "date", true),
    edge("transactions", "date", false),
    edge("card_purchases", "purchase_date", true),
    edge("card_purchases", "purchase_date", false),
    edge("card_installments", "competence", true),
    edge("card_installments", "competence", false),
  ]);
  const mins = [txMin, purchaseMin, instMin].filter((v): v is string => Boolean(v)).sort();
  const maxes = [txMax, purchaseMax, instMax].filter((v): v is string => Boolean(v)).sort();
  if (!mins.length) return resolvePeriodPreset("month");
  return { periodStart: startOfMonth(mins[0]), periodEnd: endOfMonth(maxes[maxes.length - 1]) };
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

/** Monthly result (income − expense) and its running total — "quanto já ganhei/perdi até aqui". */
export function getReportResultSeries(evolution: MonthlyEvolutionDTO[]): ReportResultPointDTO[] {
  let cumulative = 0;
  return evolution.map((point) => {
    const result = subtractMoney(point.income, point.expense);
    cumulative = addMoney(cumulative, result);
    return { month: point.month, result, cumulative };
  });
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
