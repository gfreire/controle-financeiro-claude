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
}: {
  label: string;
  planned: number;
  actual: number;
  status: "OK" | "EXCEEDED";
  meta?: string;
}) {
  const pct = toPercentage(actual, planned);
  return (
    <div className="flex flex-col gap-1">
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

export function BudgetsPanel({ budgets, fixedExpenses }: { budgets: BudgetDTO[]; fixedExpenses: FixedExpenseDTO[] }) {
  if (!budgets.length && !fixedExpenses.length) {
    return (
      <Card elevation="sm">
        <CardTitle>Orçamentos e despesas fixas</CardTitle>
        <p className="text-sm opacity-60">Nenhum orçamento ou despesa fixa configurada ainda.</p>
      </Card>
    );
  }

  return (
    <Card elevation="sm" className="gap-4">
      <CardTitle>Orçamentos e despesas fixas</CardTitle>
      <div className="grid gap-4 sm:grid-cols-2">
        {budgets.length > 0 && (
          <div className="flex flex-col gap-3">
            <h3 className="text-[11px] uppercase tracking-wide opacity-60">Orçamentos</h3>
            {budgets.map((b) => (
              <ProgressRow key={b.id} label={b.categoryName} meta={b.subcategoryName} planned={b.plannedAmount} actual={b.actualAmount} status={b.status} />
            ))}
          </div>
        )}
        {fixedExpenses.length > 0 && (
          <div className="flex flex-col gap-3">
            <h3 className="text-[11px] uppercase tracking-wide opacity-60">Despesas fixas</h3>
            {fixedExpenses.map((f) => (
              <ProgressRow
                key={f.id}
                label={f.name}
                meta={f.isPaidThisMonth ? "pago" : `vence dia ${f.dueDay}`}
                planned={f.plannedAmount}
                actual={f.projectedAmount}
                status={f.status}
              />
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
