import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils/currency";
import { toPercentage } from "@/lib/utils/number";
import type { BudgetDTO, FixedExpenseDTO } from "@/types/dto";

function ProgressRow({
  label,
  planned,
  actual,
  status,
  meta,
  indent,
}: {
  label: string;
  planned: number;
  actual: number;
  status: "OK" | "EXCEEDED";
  meta?: string;
  indent?: boolean;
}) {
  const pct = toPercentage(actual, planned);
  return (
    <div className={`flex flex-col gap-1 ${indent ? "ml-4 border-l border-divider pl-3" : ""}`}>
      <div className="flex items-center justify-between text-[13px]">
        <span className="flex items-center gap-1.5">
          {label}
          {meta && <span className="text-[11px] opacity-50">{meta}</span>}
        </span>
        <span className="tabular-nums opacity-80">
          {formatCurrency(actual)} / {formatCurrency(planned)}
        </span>
      </div>
      <div className="h-1.5 w-full bg-neutral-200">
        <div
          className={status === "EXCEEDED" ? "h-full bg-danger-500" : "h-full bg-accent"}
          style={{ width: `${pct}%` }}
        />
      </div>
      {status === "EXCEEDED" && (
        <Badge variant="danger" className="w-fit">Estourou o orçamento</Badge>
      )}
    </div>
  );
}

/**
 * Fixed expenses are a committed floor on their category/subcategory's budget (see
 * AI_CONTEXT.md "Budget hierarchy") — nested here under their parent budget so the panel
 * reads as one hierarchy (category → subcategory → fixed expense) instead of two unrelated
 * lists. Purely a display grouping of already-aggregated DTOs — no new totals are computed
 * here (that would belong in the service layer, per the "no reduce() in components" rule).
 */
export function BudgetsPanel({ budgets, fixedExpenses }: { budgets: BudgetDTO[]; fixedExpenses: FixedExpenseDTO[] }) {
  if (!budgets.length && !fixedExpenses.length) {
    return (
      <Card elevation="sm">
        <CardTitle>Orçamentos e despesas fixas</CardTitle>
        <p className="text-sm opacity-60">Nenhum orçamento ou despesa fixa configurada ainda.</p>
      </Card>
    );
  }

  const categoryBudgets = budgets.filter((b) => !b.subcategoryId);
  const subcategoryBudgets = budgets.filter((b) => b.subcategoryId);

  const categoryNames = new Map<string, string>();
  for (const b of budgets) categoryNames.set(b.categoryId, b.categoryName);
  for (const f of fixedExpenses) if (!categoryNames.has(f.categoryId)) categoryNames.set(f.categoryId, f.categoryName);

  const categoryIds = [...new Set([...budgets.map((b) => b.categoryId), ...fixedExpenses.map((f) => f.categoryId)])];

  return (
    <Card elevation="sm" className="gap-4">
      <CardTitle>Orçamentos e despesas fixas</CardTitle>
      <div className="flex flex-col gap-5">
        {categoryIds.map((categoryId) => {
          const categoryBudget = categoryBudgets.find((b) => b.categoryId === categoryId);
          const subBudgetsHere = subcategoryBudgets.filter((b) => b.categoryId === categoryId);
          const directFixedExpenses = fixedExpenses.filter((f) => f.categoryId === categoryId && !f.subcategoryId);
          if (!categoryBudget && subBudgetsHere.length === 0 && directFixedExpenses.length === 0) return null;

          return (
            <div key={categoryId} className="flex flex-col gap-2">
              {categoryBudget ? (
                <ProgressRow label={categoryBudget.categoryName} planned={categoryBudget.plannedAmount} actual={categoryBudget.actualAmount} status={categoryBudget.status} />
              ) : (
                <h3 className="text-[13px] font-medium">{categoryNames.get(categoryId) || "Sem categoria"}</h3>
              )}

              {subBudgetsHere.map((sb) => {
                const nestedFixed = fixedExpenses.filter((f) => f.subcategoryId === sb.subcategoryId);
                return (
                  <div key={sb.id} className="flex flex-col gap-2">
                    <ProgressRow indent label={sb.subcategoryName ?? ""} planned={sb.plannedAmount} actual={sb.actualAmount} status={sb.status} />
                    {nestedFixed.map((f) => (
                      <ProgressRow
                        key={f.id}
                        indent
                        label={`↳ ${f.name}`}
                        meta={f.isPaidThisMonth ? "pago" : `vence dia ${f.dueDay}`}
                        planned={f.plannedAmount}
                        actual={f.projectedAmount}
                        status={f.status}
                      />
                    ))}
                  </div>
                );
              })}

              {directFixedExpenses.map((f) => (
                <ProgressRow
                  key={f.id}
                  indent
                  label={`↳ ${f.name}`}
                  meta={f.isPaidThisMonth ? "pago" : `vence dia ${f.dueDay}`}
                  planned={f.plannedAmount}
                  actual={f.projectedAmount}
                  status={f.status}
                />
              ))}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
