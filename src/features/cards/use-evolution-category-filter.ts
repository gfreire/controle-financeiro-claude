"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useNavigationProgress } from "@/components/providers/navigation-progress";

/**
 * Additive/multi-select category filter local to the Cards page's evolution chart — deliberately
 * a separate `evoCategories` param from the page's existing single-select `categoryId` (used by
 * CardFilters to narrow the installment list below), so the chart and the list can be filtered
 * independently. Same toggle/clear shape as the dashboard's useCategoryFilter.
 */
export function useEvolutionCategoryFilter() {
  const { navigate } = useNavigationProgress();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeIds = (searchParams.get("evoCategories") ?? "").split(",").filter(Boolean);

  function toggle(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    const next = new Set(activeIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    if (next.size) params.set("evoCategories", [...next].join(","));
    else params.delete("evoCategories");
    navigate(`${pathname}?${params.toString()}`);
  }

  function clear() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("evoCategories");
    navigate(`${pathname}?${params.toString()}`);
  }

  return { activeIds, toggle, clear };
}
