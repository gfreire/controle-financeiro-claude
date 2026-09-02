"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { AccountSelect, AccountBalanceHint } from "@/components/ui/account-select";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, Textarea, FieldError } from "@/components/ui/input";
import { addReserveAction } from "../actions";
import { goalReserveSchema } from "@/lib/validations/goals";
import { todayIso } from "@/lib/utils/date";
import type { AccountDTO } from "@/types/dto";

export function ReserveDialog({
  goalId,
  goalName,
  accounts,
  trigger,
}: {
  goalId: string;
  goalName: string;
  /** CASH/BANK only. */
  accounts: AccountDTO[];
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(todayIso());
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [description, setDescription] = useState("");

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setDate(todayIso());
      setAmount("");
      setAccountId(accounts[0]?.id ?? "");
      setDescription("");
      setError(null);
    }
  }

  function handleSubmit() {
    setError(null);
    const parsed = goalReserveSchema.safeParse({
      goalId,
      accountId,
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
        await addReserveAction(parsed.data);
        router.refresh();
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao registrar aporte");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle>Aportar para {goalName}</DialogTitle>
        <p className="text-xs opacity-70">O valor sai da conta escolhida e passa a contar como guardado para esta meta.</p>
        <Field>
          <Label>Conta de origem</Label>
          <AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} />
          <AccountBalanceHint accounts={accounts} accountId={accountId} />
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
          <Label>Descrição (opcional)</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder={`Aporte para meta ${goalName}`} />
        </Field>
        <FieldError>{error}</FieldError>
        <DialogActions>
          <DialogClose asChild><Button variant="secondary" size="sm">Cancelar</Button></DialogClose>
          <Button size="sm" disabled={pending || !amount || !accountId} onClick={handleSubmit}>{pending ? "Salvando..." : "Aportar"}</Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
