"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useNavigationProgress } from "@/components/providers/navigation-progress";

/**
 * The dashboard's `categories` filter is additive/multi-select: clicking one category isolates
 * it, clicking a second adds it to the selection (sum of both), clicking an already-selected one
 * removes it. Backed by the same comma-joined `categories` search param `parseDashboardFilters`
 * (features/dashboard/filters.ts) already parses into a string[] — including the "uncategorized"
 * sentinel token, which this hook treats like any other id. Shared by the category filter in
 * dashboard-filters.tsx and the click-to-toggle affordance on category-pie, so the two stay in
 * sync instead of each keeping its own idea of "selected".
 */
export function useCategoryFilter() {
  const { navigate } = useNavigationProgress();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeIds = (searchParams.get("categories") ?? "").split(",").filter(Boolean);

  function toggle(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    const next = new Set(activeIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    if (next.size) params.set("categories", [...next].join(","));
    else params.delete("categories");
    navigate(`${pathname}?${params.toString()}`);
  }

  function clear() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("categories");
    navigate(`${pathname}?${params.toString()}`);
  }

  return { activeIds, toggle, clear };
}
