import type { ReactNode } from "react";
import { ProgressRow } from "./progress-row";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";
import type { BudgetTreeCategoryDTO, BudgetTreeSubcategoryDTO, FixedExpenseDTO, TransactionViewDTO } from "@/types/dto";

/**
 * The transactions/installments that actually compute a box's `actual` figure — same filter
 * `getActualAmountForCategory` (_shared.ts) uses: category-level matches everything under the
 * category regardless of subcategory (mirrors "category ceilings" including untracked
 * subcategories, AI_CONTEXT.md "Budgets"); subcategory-level matches that subcategory only.
 */
function transactionsFor(transactions: TransactionViewDTO[], categoryId: string, subcategoryId?: string): TransactionViewDTO[] {
  return transactions.filter((t) => t.categoryId === categoryId && (subcategoryId ? t.subcategoryId === subcategoryId : true));
}

/** Collapsed-by-default breakdown of what's computing a box's total — no JS needed (native <details>). */
function BudgetTransactionsList({ transactions }: { transactions: TransactionViewDTO[] }) {
  if (transactions.length === 0) return null;
  return (
    <details className="ml-4 border-l border-divider pl-3">
      <summary className="cursor-pointer text-[11px] opacity-50 select-none">
        {transactions.length} lançamento{transactions.length > 1 ? "s" : ""} neste mês
      </summary>
      <ul className="mt-1 flex flex-col gap-1">
        {transactions.map((t) => (
          <li key={`${t.source}-${t.id}`} className="flex items-center justify-between gap-2 text-[12px]">
            <span className="min-w-0 truncate opacity-70">
              {formatDate(t.date)} · {t.description || "Sem descrição"}
              {t.source === "installment" && <Badge variant="neutral" className="ml-1">cartão</Badge>}
            </span>
            <span className="shrink-0 tabular-nums opacity-80">{formatCurrency(t.amount)}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

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
  transactions,
  renderCategoryActions,
  renderSubcategoryActions,
  renderFixedExpenseActions,
}: {
  categories: BudgetTreeCategoryDTO[];
  /** When provided, each box shows a collapsible breakdown of the transactions/installments computing its total. Omitted by the dashboard panel to stay lightweight. */
  transactions?: TransactionViewDTO[];
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
              {transactions && <BudgetTransactionsList transactions={transactionsFor(transactions, c.categoryId)} />}
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
                  {transactions && <BudgetTransactionsList transactions={transactionsFor(transactions, c.categoryId, s.subcategoryId)} />}
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
              {transactions && <BudgetTransactionsList transactions={transactionsFor(transactions, c.categoryId, s.subcategoryId)} />}
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
                {transactions && <BudgetTransactionsList transactions={transactionsFor(transactions, c.categoryId, s.subcategoryId)} />}
                {s.fixedExpenses.map((f) => <FixedExpenseRow key={f.id} f={f} actions={renderFixedExpenseActions?.(f)} />)}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
