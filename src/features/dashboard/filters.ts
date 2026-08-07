import { resolvePeriodPreset, todayIso, type DashboardPeriodPreset } from "@/lib/utils/date";
import type { DashboardFilters } from "@/types/dto";

export type DashboardSearchParams = {
  period?: string;
  month?: string;
  periodStart?: string;
  periodEnd?: string;
  accounts?: string;
  categories?: string;
  subcategories?: string;
  type?: string;
};

const VALID_PRESETS: DashboardPeriodPreset[] = ["month", "last3", "last6", "last12", "year", "custom"];

export function parseDashboardFilters(searchParams: DashboardSearchParams): DashboardFilters & { preset: DashboardPeriodPreset } {
  const preset = (VALID_PRESETS.includes(searchParams.period as DashboardPeriodPreset) ? searchParams.period : "month") as DashboardPeriodPreset;
  const reference = searchParams.month ? `${searchParams.month}-01` : todayIso();

  const { periodStart, periodEnd } =
    preset === "custom" && searchParams.periodStart && searchParams.periodEnd
      ? { periodStart: searchParams.periodStart, periodEnd: searchParams.periodEnd }
      : resolvePeriodPreset(preset, reference);

  // "uncategorized" is a UI-only sentinel (clicking the null-category slice of a chart) — never
  // a real category id, so it must never reach a `.in("category_id", [...])` filter as a string.
  const categoryTokens = searchParams.categories ? searchParams.categories.split(",").filter(Boolean) : [];
  const uncategorizedOnly = categoryTokens.includes("uncategorized");
  const realCategoryIds = categoryTokens.filter((id) => id !== "uncategorized");

  return {
    preset,
    periodStart,
    periodEnd,
    accounts: searchParams.accounts ? searchParams.accounts.split(",").filter(Boolean) : undefined,
    categories: realCategoryIds.length ? realCategoryIds : undefined,
    uncategorizedOnly: uncategorizedOnly || undefined,
    subcategories: searchParams.subcategories ? searchParams.subcategories.split(",").filter(Boolean) : undefined,
    transactionType: searchParams.type === "INCOME" || searchParams.type === "EXPENSE" ? searchParams.type : undefined,
  };
}
