"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, Textarea, FieldError } from "@/components/ui/input";
import { registerGoalYieldAction, updateGoalYieldAction } from "../actions";
import { goalYieldSchema, updateGoalYieldSchema } from "@/lib/validations/goals";
import { todayIso } from "@/lib/utils/date";
import { formatCurrency } from "@/lib/utils/currency";
import type { GoalEntryDTO } from "@/types/dto";

/**
 * "Informar rendimento" (create) — enter the goal's current real balance; the delta over the
 * computed balance is logged as a yield. Same UX as an account's registerYield. In edit mode
 * (`entry` present) it edits an existing informed-yield row directly (amount + date).
 */
export function GoalYieldDialog({
  goalId,
  goalName,
  currentBalance,
  entry,
  trigger,
}: {
  goalId: string;
  goalName: string;
  currentBalance: number;
  /** Present → edit an existing YIELD ledger row. */
  entry?: GoalEntryDTO;
  trigger: React.ReactNode;
}) {
  const isEdit = !!entry;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(entry?.date ?? todayIso());
  const [realBalance, setRealBalance] = useState(isEdit ? "" : String(Math.max(0, currentBalance)));
  const [amount, setAmount] = useState(entry?.amount !== undefined ? String(entry.amount) : "");
  const [description, setDescription] = useState(entry?.description ?? "");

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setDate(entry?.date ?? todayIso());
      setRealBalance(isEdit ? "" : String(Math.max(0, currentBalance)));
      setAmount(entry?.amount !== undefined ? String(entry.amount) : "");
      setDescription(entry?.description ?? "");
      setError(null);
    }
  }

  const delta = !isEdit && realBalance ? Number(realBalance) - currentBalance : null;

  function handleSubmit() {
    setError(null);
    if (isEdit) {
      const parsed = updateGoalYieldSchema.safeParse({
        id: entry.id,
        amount: Number(amount),
        date,
        description: description || undefined,
      });
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "Dados inválidos");
        return;
      }
      startTransition(async () => {
        try {
          await updateGoalYieldAction(parsed.data);
          router.refresh();
          setOpen(false);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Erro ao editar rendimento");
        }
      });
      return;
    }

    const parsed = goalYieldSchema.safeParse({ goalId, realBalance: Number(realBalance), date });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    startTransition(async () => {
      try {
        await registerGoalYieldAction(parsed.data);
        router.refresh();
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao informar rendimento");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle>{isEdit ? "Editar rendimento" : `Informar rendimento — ${goalName}`}</DialogTitle>
        {isEdit ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Field>
                <Label>Valor do rendimento</Label>
                <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              <Field>
                <Label>Data</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
            </div>
            <Field>
              <Label>Descrição (opcional)</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            </Field>
          </>
        ) : (
          <>
            <p className="text-xs opacity-70">
              Guardado hoje (calculado): {formatCurrency(currentBalance)}. Informe o saldo real atual da meta — a diferença vira um rendimento.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Field>
                <Label>Saldo real atual</Label>
                <Input type="number" step="0.01" min="0" value={realBalance} onChange={(e) => setRealBalance(e.target.value)} />
              </Field>
              <Field>
                <Label>Data</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
            </div>
            {delta !== null && (
              <p className="-mt-1 text-[11px] opacity-70">
                {delta > 0
                  ? `Rendimento de ${formatCurrency(delta)} será lançado.`
                  : "Sem diferença positiva — nada será lançado."}
              </p>
            )}
          </>
        )}
        <FieldError>{error}</FieldError>
        <DialogActions>
          <DialogClose asChild><Button variant="secondary" size="sm">Cancelar</Button></DialogClose>
          <Button size="sm" disabled={pending || (isEdit ? !amount : !realBalance)} onClick={handleSubmit}>{pending ? "Salvando..." : "Salvar"}</Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
