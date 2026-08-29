"use client";

import { CategoryCheckboxFilter } from "@/components/ui/category-checkbox-filter";
import type { CategoryDTO } from "@/types/dto";
import { useCategoryFilter } from "@/features/dashboard/use-category-filter";

/**
 * Additive/multi-select category filter: check one to isolate it, check a second to add it to
 * the selection (every chart/table on the dashboard sums both), uncheck to drop it. Shares
 * useCategoryFilter with the click-to-toggle affordance on CategoryPie so both entry points stay
 * in sync on the same `categories` search param.
 *
 * The "Receitas"/"Despesas" group headers carry a select-all checkbox — checking one selects
 * every category of that type at once, which is how the dashboard filters "só receitas" / "só
 * despesas" now (the standalone Tipo dropdown was removed 2026-08-28). Unchecking a single
 * member afterwards leaves the group checkbox indeterminate with the rest still selected.
 */
export function CategoryMultiSelect({ categories }: { categories: CategoryDTO[] }) {
  const { activeIds, toggle, clear, setGroup } = useCategoryFilter();

  const groups = [
    { label: "Receitas", items: categories.filter((c) => c.type === "INCOME") },
    { label: "Despesas", items: categories.filter((c) => c.type === "EXPENSE") },
  ];

  return (
    <CategoryCheckboxFilter
      groups={groups}
      activeIds={activeIds}
      onToggle={toggle}
      onToggleGroup={setGroup}
      onClear={clear}
    />
  );
}
