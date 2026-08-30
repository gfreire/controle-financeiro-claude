"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { AccountSelect } from "@/components/ui/account-select";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, Textarea, FieldError } from "@/components/ui/input";
import { redeemGoalAction } from "../actions";
import { goalRedeemSchema } from "@/lib/validations/goals";
import { todayIso } from "@/lib/utils/date";
import { formatCurrency } from "@/lib/utils/currency";
import type { AccountDTO } from "@/types/dto";

/**
 * Resgate — money leaves the goal back into a CASH/BANK account. The reason toggle
 * (Concluída / Antecipado) maps to the two `is_system` categories server-side; it's pre-selected
 * from whether the current balance already reached the target, and stays overridable.
 */
export function RedeemDialog({
  goalId,
  goalName,
  currentBalance,
  goalTarget,
  accounts,
  trigger,
}: {
  goalId: string;
  goalName: string;
  currentBalance: number;
  goalTarget: number;
  accounts: AccountDTO[];
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const reachedByDefault = currentBalance >= goalTarget;
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(todayIso());
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [description, setDescription] = useState("");
  const [reason, setReason] = useState<"COMPLETED" | "EARLY">(reachedByDefault ? "COMPLETED" : "EARLY");

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setDate(todayIso());
      setAmount(String(Math.max(0, currentBalance)));
      setAccountId(accounts[0]?.id ?? "");
      setDescription("");
      setReason(reachedByDefault ? "COMPLETED" : "EARLY");
      setError(null);
    }
  }

  function handleSubmit() {
    setError(null);
    const parsed = goalRedeemSchema.safeParse({
      goalId,
      accountId,
      amount: Number(amount),
      date,
      description: description || undefined,
      reason,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    startTransition(async () => {
      try {
        await redeemGoalAction(parsed.data);
        router.refresh();
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao registrar resgate");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle>Resgatar de {goalName}</DialogTitle>
        <p className="text-xs opacity-70">
          Guardado agora: {formatCurrency(currentBalance)}. O valor entra na conta escolhida. Se sacar mais que o guardado, o excedente é reconhecido como rendimento.
        </p>
        <Field>
          <Label>Conta de destino</Label>
          <AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field>
            <Label>Valor</Label>
            <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field>
            <Label>Data</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field>
          <Label>Motivo</Label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setReason("COMPLETED")}
              className={`flex-1 border px-2 py-1.5 text-xs ${reason === "COMPLETED" ? "border-accent text-accent" : "border-divider opacity-70"}`}
            >
              Meta concluída
            </button>
            <button
              type="button"
              onClick={() => setReason("EARLY")}
              className={`flex-1 border px-2 py-1.5 text-xs ${reason === "EARLY" ? "border-accent text-accent" : "border-divider opacity-70"}`}
            >
              Resgate antecipado
            </button>
          </div>
        </Field>
        <Field>
          <Label>Descrição (opcional)</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder={`Resgate da meta ${goalName}`} />
        </Field>
        <FieldError>{error}</FieldError>
        <DialogActions>
          <DialogClose asChild><Button variant="secondary" size="sm">Cancelar</Button></DialogClose>
          <Button size="sm" disabled={pending || !amount || !accountId} onClick={handleSubmit}>{pending ? "Salvando..." : "Resgatar"}</Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
