"use client";

import { CategoryCheckboxFilter } from "@/components/ui/category-checkbox-filter";
import type { CategoryDTO } from "@/types/dto";
import { useCategoryFilter } from "@/features/dashboard/use-category-filter";

/**
 * Additive/multi-select category filter: check one to isolate it, check a second to add it to
 * the selection (every chart/table on the dashboard sums both), uncheck to drop it. Shares
 * useCategoryFilter with the click-to-toggle affordance on CategoryPie/CategoryBars so all three
 * entry points stay in sync on the same `categories` search param.
 */
export function CategoryMultiSelect({ categories }: { categories: CategoryDTO[] }) {
  const { activeIds, toggle, clear } = useCategoryFilter();

  const groups = [
    { label: "Receitas", items: categories.filter((c) => c.type === "INCOME") },
    { label: "Despesas", items: categories.filter((c) => c.type === "EXPENSE") },
  ];

  return <CategoryCheckboxFilter groups={groups} activeIds={activeIds} onToggle={toggle} onClear={clear} />;
}
