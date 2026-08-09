import type { ReactNode } from "react";
import { ProgressRow } from "./progress-row";
import type { BudgetTreeCategoryDTO, BudgetTreeSubcategoryDTO, FixedExpenseDTO } from "@/types/dto";

// Inside the budget tree, the bar reflects whether the bill has actually been paid this month —
// `actualAmount` (real linked transactions, 0 when unpaid), never `projectedAmount` (the planned
// placeholder used elsewhere, e.g. the fixed-expense form dialog's own prefill, to keep monthly
// totals from looking like nothing is due yet). Decided 2026-08-08: a full bar here must mean
// "paid," not "this is what I expect to owe."
function FixedExpenseRow({ f, actions }: { f: FixedExpenseDTO; actions?: ReactNode }) {
  return (
    <ProgressRow
      indent
      label={`↳ ${f.name}`}
      meta={f.isPaidThisMonth ? "pago" : `vence dia ${f.dueDay}`}
      planned={f.plannedAmount}
      actual={f.actualAmount}
      status={f.status}
      actions={actions}
    />
  );
}

/**
 * Grouped tree display for a month's budgets (AI_CONTEXT.md "Budgets"). Purely presentational —
 * all the grouping/collapse logic already happened server-side in getBudgetTree; this component
 * only decides how to lay out what it's given:
 * - `budget !== null`: real headroom is guaranteed (see AI_CONTEXT.md), so nest normally.
 * - `budget === null` and exactly one subcategory: merge into a single box — no separate,
 *   number-less category line for just one child.
 * - `budget === null` and 2+ subcategories: a bare category-name divider, then each subcategory
 *   as its own standalone box.
 * Fixed expenses are the tree's only leaf level — there's no separate "despesas fixas" list
 * anywhere else in the app; `renderFixedExpenseActions` is how a page wires up pay/edit/delete
 * directly on each nested fixed-expense row (decided 2026-08-08, replacing the old tabbed layout).
 */
export function BudgetTree({
  categories,
  renderCategoryActions,
  renderSubcategoryActions,
  renderFixedExpenseActions,
}: {
  categories: BudgetTreeCategoryDTO[];
  renderCategoryActions?: (c: BudgetTreeCategoryDTO) => ReactNode;
  renderSubcategoryActions?: (c: BudgetTreeCategoryDTO, s: BudgetTreeSubcategoryDTO) => ReactNode;
  renderFixedExpenseActions?: (f: FixedExpenseDTO) => ReactNode;
}) {
  if (categories.length === 0) {
    return <p className="text-sm opacity-60">Nenhum orçamento definido ainda.</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      {categories.map((c) => {
        if (c.budget) {
          return (
            <div key={c.categoryId} className="flex flex-col gap-2">
              <ProgressRow
                label={`${c.icon ? `${c.icon} ` : ""}${c.categoryName}`}
                planned={c.budget.plannedAmount}
                actual={c.budget.actualAmount}
                status={c.budget.status}
                actions={renderCategoryActions?.(c)}
              />
              {c.subcategories.map((s) => (
                <div key={s.budgetId} className="flex flex-col gap-2">
                  <ProgressRow
                    indent
                    label={s.subcategoryName}
                    planned={s.plannedAmount}
                    actual={s.actualAmount}
                    status={s.status}
                    actions={renderSubcategoryActions?.(c, s)}
                  />
                  {s.fixedExpenses.map((f) => <FixedExpenseRow key={f.id} f={f} actions={renderFixedExpenseActions?.(f)} />)}
                </div>
              ))}
              {c.directFixedExpenses.map((f) => <FixedExpenseRow key={f.id} f={f} actions={renderFixedExpenseActions?.(f)} />)}
            </div>
          );
        }

        if (c.subcategories.length === 1) {
          const s = c.subcategories[0];
          return (
            <div key={c.categoryId} className="flex flex-col gap-2">
              <ProgressRow
                label={`${c.icon ? `${c.icon} ` : ""}${c.categoryName} · ${s.subcategoryName}`}
                planned={s.plannedAmount}
                actual={s.actualAmount}
                status={s.status}
                actions={renderSubcategoryActions?.(c, s)}
              />
              {s.fixedExpenses.map((f) => <FixedExpenseRow key={f.id} f={f} actions={renderFixedExpenseActions?.(f)} />)}
            </div>
          );
        }

        return (
          <div key={c.categoryId} className="flex flex-col gap-3">
            <h3 className="text-[13px] font-medium">{c.icon ? `${c.icon} ` : ""}{c.categoryName}</h3>
            {c.subcategories.map((s) => (
              <div key={s.budgetId} className="flex flex-col gap-2">
                <ProgressRow
                  label={`${c.categoryName} · ${s.subcategoryName}`}
                  planned={s.plannedAmount}
                  actual={s.actualAmount}
                  status={s.status}
                  actions={renderSubcategoryActions?.(c, s)}
                />
                {s.fixedExpenses.map((f) => <FixedExpenseRow key={f.id} f={f} actions={renderFixedExpenseActions?.(f)} />)}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
