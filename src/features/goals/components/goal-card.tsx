import { getGoalEntries } from "@/services/goals.service";
import { Card, CardKicker, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DonutWithTotal } from "@/components/ui/donut-with-total";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDate, formatMonthLabel } from "@/lib/utils/date";
import { Target, Plus, TrendingUp, ArrowDownToLine, Pencil } from "lucide-react";
import { GoalFormDialog } from "./goal-form-dialog";
import { ReserveDialog } from "./reserve-dialog";
import { RedeemDialog } from "./redeem-dialog";
import { GoalYieldDialog } from "./goal-yield-dialog";
import { EditGoalEntryDialog } from "./edit-goal-entry-dialog";
import { DeleteGoalButton } from "./delete-goal-button";
import { DeleteGoalEntryButton } from "./delete-goal-entry-button";
import { RecalculateGoalButton } from "./recalculate-goal-button";
import type { AccountDTO, GoalDTO } from "@/types/dto";

function StatusBadge({ goal }: { goal: GoalDTO }) {
  const n = goal.scheduleOffsetMonths ?? 0;
  const months = (v: number) => `${v} ${v === 1 ? "mês" : "meses"}`;
  switch (goal.status) {
    case "REACHED":
      return <Badge variant="success">Meta atingida</Badge>;
    case "AHEAD":
      return <Badge variant="success">Adiantado {months(n)}</Badge>;
    case "BEHIND":
      return <Badge variant="danger">Atrasado {months(-n)}</Badge>;
    case "ON_TRACK":
      return <Badge variant="success">Em dia</Badge>;
    default:
      return <Badge variant="neutral">Sem prazo</Badge>;
  }
}

/** One goal card — donut + status, aporte/rendimento/resgate actions, and the last few ledger
 * entries. Async server component (fetches its own ledger), mirroring DebtCard. */
export async function GoalCard({
  goal,
  accounts,
}: {
  goal: GoalDTO;
  /** CASH/BANK only — a goal aporte/resgate never touches a credit card. */
  accounts: AccountDTO[];
}) {
  const entries = await getGoalEntries(goal.id);

  const saved = Math.max(0, Math.min(goal.currentBalance, goal.goalTarget));
  const remaining = Math.max(0, goal.goalTarget - goal.currentBalance);
  const donutData = [
    { id: "saved", name: "Guardado", value: saved, color: "var(--color-success-500)" },
    { id: "left", name: "Falta", value: remaining, color: "var(--color-divider)" },
  ];

  return (
    <Card elevation="sm" className="gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardKicker className="flex flex-wrap items-center gap-1.5">
            <Target className="size-3" strokeWidth={1.5} />
            <StatusBadge goal={goal} />
            {goal.endDate && <Badge variant="warning">Prazo {formatMonthLabel(goal.endDate)}</Badge>}
          </CardKicker>
          <div className="flex items-center gap-1.5">
            <CardTitle>{goal.name}</CardTitle>
            <GoalFormDialog
              accounts={accounts}
              goal={goal}
              trigger={
                <button type="button" className="p-1.5 -m-1.5 opacity-50 hover:opacity-100" aria-label="Editar meta">
                  <Pencil className="size-3.5" strokeWidth={1.5} />
                </button>
              }
            />
            <DeleteGoalButton goalId={goal.id} name={goal.name} />
          </div>
          <div className="text-xl font-semibold tabular-nums">{formatCurrency(goal.currentBalance)}</div>
          <p className="text-xs opacity-60">
            {goal.progressPercent}% de {formatCurrency(goal.goalTarget)}
            {goal.monthlyContribution !== undefined && ` · ${formatCurrency(goal.monthlyContribution)}/mês`}
          </p>
          {goal.yieldTotal > 0 && (
            <p className="text-xs opacity-60">Rendimento acumulado: {formatCurrency(goal.yieldTotal)}</p>
          )}
          {goal.status !== "REACHED" && goal.projectedCompletionMonth && (
            <p className="text-xs opacity-60">Previsão: {formatMonthLabel(goal.projectedCompletionMonth)}</p>
          )}
          {goal.endDate && (
            <div className="mt-1">
              <RecalculateGoalButton
                goalId={goal.id}
                currentBalance={goal.currentBalance}
                goalTarget={goal.goalTarget}
                endDate={goal.endDate}
              />
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <ReserveDialog
            goalId={goal.id}
            goalName={goal.name}
            accounts={accounts}
            trigger={<Button size="sm" variant="secondary"><Plus className="size-3.5" strokeWidth={1.5} /> Aportar</Button>}
          />
          <GoalYieldDialog
            goalId={goal.id}
            goalName={goal.name}
            currentBalance={goal.currentBalance}
            trigger={<Button size="sm" variant="secondary"><TrendingUp className="size-3.5" strokeWidth={1.5} /> Rendimento</Button>}
          />
          <RedeemDialog
            goalId={goal.id}
            goalName={goal.name}
            currentBalance={goal.currentBalance}
            goalTarget={goal.goalTarget}
            accounts={accounts}
            trigger={<Button size="sm"><ArrowDownToLine className="size-3.5" strokeWidth={1.5} /> Resgatar</Button>}
          />
        </div>
      </div>

      <DonutWithTotal
        data={donutData}
        total={goal.goalTarget}
        centerLabel={formatCurrency(goal.currentBalance)}
        centerSubLabel={`${goal.progressPercent}% de ${formatCurrency(goal.goalTarget)}`}
        emptyMessage="Sem valor guardado ainda."
      />

      {entries.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {entries.slice(0, 8).map((entry) => {
            const positive = entry.kind === "REDEEM" || entry.kind === "YIELD";
            return (
              <li key={`${entry.kind}-${entry.id}`} className="flex items-center justify-between gap-2 border-b border-text/[0.06] py-1">
                <span className="opacity-70">
                  {formatDate(entry.date)} {entry.description && `· ${entry.description}`}
                  {entry.kind === "YIELD" && <Badge variant="success" className="ml-1.5">rendimento</Badge>}
                </span>
                <span className="flex items-center gap-2">
                  <span className={positive ? "text-success-600 tabular-nums" : "text-danger-600 tabular-nums"}>
                    {positive ? "+" : "−"}
                    {formatCurrency(entry.amount)}
                  </span>
                  <span className="flex items-center gap-1">
                    {entry.kind === "YIELD" && !entry.description?.startsWith("Rendimento reconhecido no resgate") && (
                      <GoalYieldDialog
                        goalId={goal.id}
                        goalName={goal.name}
                        currentBalance={goal.currentBalance}
                        entry={entry}
                        trigger={
                          <button type="button" className="p-1.5 -m-1.5 opacity-60 hover:opacity-100" aria-label="Editar rendimento">
                            <Pencil className="size-3" strokeWidth={1.5} />
                          </button>
                        }
                      />
                    )}
                    {(entry.kind === "RESERVE" || entry.kind === "REDEEM") && (
                      <EditGoalEntryDialog
                        entry={entry}
                        accounts={accounts}
                        trigger={
                          <button type="button" className="p-1.5 -m-1.5 opacity-60 hover:opacity-100" aria-label="Editar lançamento">
                            <Pencil className="size-3" strokeWidth={1.5} />
                          </button>
                        }
                      />
                    )}
                    <DeleteGoalEntryButton entry={entry} />
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
