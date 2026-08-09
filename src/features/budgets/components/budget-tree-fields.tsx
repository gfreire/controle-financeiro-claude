import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils/currency";
import type { CategoryDTO, FixedExpenseDTO } from "@/types/dto";

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
  fixedExpenses = [],
}: {
  categories: CategoryDTO[];
  amounts: Record<RowKey, string>;
  onChange: (key: RowKey, value: string) => void;
  fixedExpenses?: FixedExpenseDTO[];
}) {
  const expenseCategories = categories.filter((c) => c.type === "EXPENSE");

  // Mirrors the server-side floor (AI_CONTEXT.md "Budget hierarchy") using data already on
  // screen — a category's floor is the live sum of its subcategory rows in this same form plus
  // its own direct fixed expenses; a subcategory's floor is just its fixed expenses.
  function categoryFloor(categoryId: string, subcategoryIds: string[]): number {
    const subSum = subcategoryIds.reduce((sum, subId) => sum + (Number(amounts[rowKey(categoryId, subId)]) || 0), 0);
    const directFixed = fixedExpenses.filter((f) => f.categoryId === categoryId && !f.subcategoryId).reduce((sum, f) => sum + f.plannedAmount, 0);
    return subSum + directFixed;
  }

  function subcategoryFloor(subcategoryId: string): number {
    return fixedExpenses.filter((f) => f.subcategoryId === subcategoryId).reduce((sum, f) => sum + f.plannedAmount, 0);
  }

  return (
    <div className="flex flex-col gap-2">
      {expenseCategories.map((category) => {
        const floor = categoryFloor(category.id, category.subcategories.map((s) => s.id));
        return (
          <div key={category.id} className="border border-divider">
            <div className="flex items-center gap-2 px-2.5 py-2 text-sm font-medium">
              <span className="flex-1">{category.icon} {category.name}</span>
              <div className="flex flex-col items-end">
                <Input
                  type="number"
                  step="0.01"
                  min={floor > 0 ? floor : "0.01"}
                  className="h-7 w-28 text-xs"
                  placeholder="—"
                  value={amounts[rowKey(category.id)] ?? ""}
                  onChange={(e) => onChange(rowKey(category.id), e.target.value)}
                />
                {floor > 0 && <span className="mt-0.5 text-[10px] opacity-50">mín. {formatCurrency(floor)}</span>}
              </div>
            </div>
            {category.subcategories.length > 0 && (
              <div className="flex flex-col gap-0.5 border-t border-divider bg-text/[0.02] py-1 pl-5">
                {category.subcategories.map((sub) => {
                  const subFloor = subcategoryFloor(sub.id);
                  return (
                    <div key={sub.id} className="flex items-center gap-2 px-2 py-1 text-[13px]">
                      <span className="flex-1">↳ {sub.name}</span>
                      <div className="flex flex-col items-end">
                        <Input
                          type="number"
                          step="0.01"
                          min={subFloor > 0 ? subFloor : "0.01"}
                          className="h-7 w-28 text-xs"
                          placeholder="—"
                          value={amounts[rowKey(category.id, sub.id)] ?? ""}
                          onChange={(e) => onChange(rowKey(category.id, sub.id), e.target.value)}
                        />
                        {subFloor > 0 && <span className="mt-0.5 text-[10px] opacity-50">mín. {formatCurrency(subFloor)}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
