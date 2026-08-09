import { Input } from "@/components/ui/input";
import type { CategoryDTO } from "@/types/dto";

export type RowKey = string; // `${categoryId}` for category-level, `${categoryId}:${subcategoryId}` for subcategory-level

export function rowKey(categoryId: string, subcategoryId?: string): RowKey {
  return subcategoryId ? `${categoryId}:${subcategoryId}` : categoryId;
}

/**
 * Pure tree-of-amount-inputs — the reusable core of "Planejar orçamentos", shared by the
 * in-page editor dialog (`budget-tree-editor.tsx`) and the onboarding first-budget step
 * (`src/app/onboarding/budget/page.tsx`), so the row layout only lives in one place.
 */
export function BudgetTreeFields({
  categories,
  amounts,
  onChange,
}: {
  categories: CategoryDTO[];
  amounts: Record<RowKey, string>;
  onChange: (key: RowKey, value: string) => void;
}) {
  const expenseCategories = categories.filter((c) => c.type === "EXPENSE");

  return (
    <div className="flex flex-col gap-2">
      {expenseCategories.map((category) => (
        <div key={category.id} className="border border-divider">
          <div className="flex items-center gap-2 px-2.5 py-2 text-sm font-medium">
            <span className="flex-1">{category.icon} {category.name}</span>
            <Input
              type="number"
              step="0.01"
              min="0"
              className="h-7 w-28 text-xs"
              placeholder="—"
              value={amounts[rowKey(category.id)] ?? ""}
              onChange={(e) => onChange(rowKey(category.id), e.target.value)}
            />
          </div>
          {category.subcategories.length > 0 && (
            <div className="flex flex-col gap-0.5 border-t border-divider bg-text/[0.02] py-1 pl-5">
              {category.subcategories.map((sub) => (
                <div key={sub.id} className="flex items-center gap-2 px-2 py-1 text-[13px]">
                  <span className="flex-1">↳ {sub.name}</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    className="h-7 w-28 text-xs"
                    placeholder="—"
                    value={amounts[rowKey(category.id, sub.id)] ?? ""}
                    onChange={(e) => onChange(rowKey(category.id, sub.id), e.target.value)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
