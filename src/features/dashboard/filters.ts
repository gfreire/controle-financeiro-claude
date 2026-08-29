import { startOfMonth, endOfMonth, todayIso } from "@/lib/utils/date";
import type { DashboardFilters } from "@/types/dto";

/**
 * The dashboard is single-month only (2026-08-28 — the period presets / custom range were
 * removed; the user found them heavy for this screen and wants a dedicated reports tab later).
 * `month` ("YYYY-MM") is the only period control now; everything else is category/account/type.
 */
export type DashboardSearchParams = {
  month?: string;
  accounts?: string;
  categories?: string;
  subcategories?: string;
  /** Local to the expense donut only — see DashboardFilters.source. Not read by parseDashboardFilters. */
  expenseSource?: string;
};

export function parseDashboardFilters(searchParams: DashboardSearchParams): DashboardFilters {
  const reference = searchParams.month ? `${searchParams.month}-01` : todayIso();
  const periodStart = startOfMonth(reference);
  const periodEnd = endOfMonth(reference);

  // "uncategorized" is a UI-only sentinel (clicking the null-category slice of a chart) — never
  // a real category id, so it must never reach a `.in("category_id", [...])` filter as a string.
  const categoryTokens = searchParams.categories ? searchParams.categories.split(",").filter(Boolean) : [];
  const uncategorizedOnly = categoryTokens.includes("uncategorized");
  const realCategoryIds = categoryTokens.filter((id) => id !== "uncategorized");

  return {
    periodStart,
    periodEnd,
    accounts: searchParams.accounts ? searchParams.accounts.split(",").filter(Boolean) : undefined,
    categories: realCategoryIds.length ? realCategoryIds : undefined,
    uncategorizedOnly: uncategorizedOnly || undefined,
    subcategories: searchParams.subcategories ? searchParams.subcategories.split(",").filter(Boolean) : undefined,
    // `transactionType` is no longer a URL control — the category filter's group checkboxes
    // ("Receitas"/"Despesas") cover "só receitas" / "só despesas" now. The two category donuts
    // still set it per-call in dashboard/page.tsx.
    transactionType: undefined,
  };
}
