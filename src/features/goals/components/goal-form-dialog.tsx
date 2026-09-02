"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { AccountSelect, AccountBalanceHint } from "@/components/ui/account-select";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, FieldError } from "@/components/ui/input";
import { Plus } from "lucide-react";
import { createGoalAction, updateGoalAction } from "../actions";
import { goalSchema, updateGoalSchema } from "@/lib/validations/goals";
import { monthKey, monthsBetween, todayIso, formatMonthLabel } from "@/lib/utils/date";
import { roundMoney, subtractMoney } from "@/lib/utils/money";
import { formatCurrency } from "@/lib/utils/currency";
import type { AccountDTO, GoalDTO } from "@/types/dto";

const NONE = "NONE";

export function GoalFormDialog({
  accounts,
  goal,
  trigger,
}: {
  accounts: AccountDTO[];
  /** Present → edit mode: prefills from this goal and saves via updateGoalAction. */
  goal?: GoalDTO;
  trigger?: React.ReactNode;
}) {
  const isEdit = !!goal;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(goal?.name ?? "");
  const [goalTarget, setGoalTarget] = useState(goal?.goalTarget !== undefined ? String(goal.goalTarget) : "");
  const [startCompetence, setStartCompetence] = useState(goal?.startCompetence ?? monthKey(todayIso()));
  const [endDate, setEndDate] = useState(goal?.endDate ?? "");
  const [monthlyContribution, setMonthlyContribution] = useState(
    goal?.monthlyContribution !== undefined ? String(goal.monthlyContribution) : ""
  );
  const [initialReserveAccountId, setInitialReserveAccountId] = useState(NONE);
  const [initialReserveAmount, setInitialReserveAmount] = useState("");

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setName(goal?.name ?? "");
      setGoalTarget(goal?.goalTarget !== undefined ? String(goal.goalTarget) : "");
      setStartCompetence(goal?.startCompetence ?? monthKey(todayIso()));
      setEndDate(goal?.endDate ?? "");
      setMonthlyContribution(goal?.monthlyContribution !== undefined ? String(goal.monthlyContribution) : "");
      setInitialReserveAccountId(NONE);
      setInitialReserveAmount("");
      setError(null);
    }
  }

  // Client-side calculator: what monthly aporte reaches the target by `endDate`, given the
  // starting amount (edit mode: current balance; create mode: the optional initial reserve).
  const suggestion = useMemo(() => {
    const target = Number(goalTarget);
    if (!endDate || !target || endDate < startCompetence.slice(0, 7)) return null;
    const months = Math.max(1, monthsBetween(startCompetence.slice(0, 7), endDate));
    const starting = isEdit ? (goal?.currentBalance ?? 0) : Number(initialReserveAmount) || 0;
    const value = roundMoney(Math.max(0, subtractMoney(target, starting)) / months);
    return value > 0 ? value : null;
  }, [goalTarget, endDate, startCompetence, isEdit, goal?.currentBalance, initialReserveAmount]);

  function handleSubmit() {
    setError(null);
    const basePayload = {
      name,
      goalTarget: Number(goalTarget),
      startCompetence,
      endDate: endDate || null,
      monthlyContribution: monthlyContribution ? Number(monthlyContribution) : null,
    };

    if (isEdit) {
      const parsed = updateGoalSchema.safeParse({ id: goal!.id, ...basePayload });
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "Dados inválidos");
        return;
      }
      startTransition(async () => {
        try {
          await updateGoalAction(parsed.data);
          router.refresh();
          setOpen(false);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Erro ao editar meta");
        }
      });
      return;
    }

    const parsed = goalSchema.safeParse({
      ...basePayload,
      initialReserveAccountId: initialReserveAccountId === NONE ? null : initialReserveAccountId,
      initialReserveAmount: initialReserveAmount ? Number(initialReserveAmount) : null,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    startTransition(async () => {
      try {
        await createGoalAction(parsed.data);
        router.refresh();
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao criar meta");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm"><Plus className="size-3.5" strokeWidth={1.5} /> Nova meta</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{isEdit ? "Editar meta" : "Nova meta"}</DialogTitle>
        <Field>
          <Label>Objetivo</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Carro, Reserva de emergência..." />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field>
            <Label>Valor da meta</Label>
            <Input type="number" step="0.01" min="0.01" value={goalTarget} onChange={(e) => setGoalTarget(e.target.value)} />
          </Field>
          <Field>
            <Label>Mês de início</Label>
            <Input type="month" value={startCompetence} onChange={(e) => setStartCompetence(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field>
            <Label>Aporte mensal (opcional)</Label>
            <Input type="number" step="0.01" min="0.01" value={monthlyContribution} onChange={(e) => setMonthlyContribution(e.target.value)} placeholder="Deixe vazio p/ calcular" />
          </Field>
          <Field>
            <Label>Prazo / data final (opcional)</Label>
            <Input type="month" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
        </div>
        {suggestion !== null && (
          <p className="-mt-1 flex items-center gap-2 text-[11px] opacity-70">
            Pra concluir até {formatMonthLabel(endDate)}: ~{formatCurrency(suggestion)}/mês
            <button
              type="button"
              className="text-accent underline hover:opacity-80"
              onClick={() => setMonthlyContribution(String(suggestion))}
            >
              usar
            </button>
          </p>
        )}
        {endDate && !monthlyContribution && (
          <p className="-mt-1 text-[11px] opacity-50">
            Sem aporte informado, o sistema usa a sugestão acima como aporte mensal da meta.
          </p>
        )}

        {!isEdit && (
          <div className="mt-1 border-t border-divider pt-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide opacity-50">Reserva inicial (opcional)</p>
            <div className="grid grid-cols-2 gap-2">
              <Field>
                <Label>Conta de onde sai</Label>
                <AccountSelect accounts={accounts} value={initialReserveAccountId} onChange={setInitialReserveAccountId} noneValue={NONE} noneLabel="Nenhuma" />
                <AccountBalanceHint accounts={accounts} accountId={initialReserveAccountId} />
              </Field>
              <Field>
                <Label>Valor já guardado</Label>
                <Input type="number" step="0.01" min="0.01" value={initialReserveAmount} onChange={(e) => setInitialReserveAmount(e.target.value)} />
              </Field>
            </div>
            <p className="mt-1 text-[11px] opacity-50">
              Move esse valor de uma conta pra meta agora. Só o que falta pro alvo entra no cálculo do aporte.
            </p>
          </div>
        )}

        {isEdit && goal?.endDate && (
          <p className="-mt-1 text-[11px] opacity-50">
            Mudar o prazo recalcula o aporte a partir de hoje, com o que você já guardou — meses anteriores não mudam.
          </p>
        )}

        <FieldError>{error}</FieldError>
        <DialogActions>
          <DialogClose asChild><Button variant="secondary" size="sm">Cancelar</Button></DialogClose>
          <Button size="sm" disabled={pending || !name || !goalTarget} onClick={handleSubmit}>{pending ? "Salvando..." : "Salvar"}</Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
