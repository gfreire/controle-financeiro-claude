"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { AccountSelect } from "@/components/ui/account-select";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, Textarea, FieldError } from "@/components/ui/input";
import { updateGoalEntryAction } from "../actions";
import { updateGoalEntrySchema } from "@/lib/validations/goals";
import type { AccountDTO, GoalEntryDTO } from "@/types/dto";

/** Edit a RESERVE/REDEEM ledger row (typo fix — amount/date/account/description). The direction
 * (aporte vs resgate) can't change here. */
export function EditGoalEntryDialog({
  entry,
  accounts,
  trigger,
}: {
  entry: GoalEntryDTO;
  accounts: AccountDTO[];
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(entry.date);
  const [amount, setAmount] = useState(String(entry.amount));
  const [accountId, setAccountId] = useState(entry.accountId ?? accounts[0]?.id ?? "");
  const [description, setDescription] = useState(entry.description ?? "");

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setDate(entry.date);
      setAmount(String(entry.amount));
      setAccountId(entry.accountId ?? accounts[0]?.id ?? "");
      setDescription(entry.description ?? "");
      setError(null);
    }
  }

  function handleSubmit() {
    setError(null);
    const parsed = updateGoalEntrySchema.safeParse({
      id: entry.id,
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
        await updateGoalEntryAction(parsed.data);
        router.refresh();
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao editar lançamento");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle>Editar {entry.kind === "RESERVE" ? "aporte" : "resgate"}</DialogTitle>
        <Field>
          <Label>{entry.kind === "RESERVE" ? "Conta de origem" : "Conta de destino"}</Label>
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
          <Label>Descrição (opcional)</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </Field>
        <FieldError>{error}</FieldError>
        <DialogActions>
          <DialogClose asChild><Button variant="secondary" size="sm">Cancelar</Button></DialogClose>
          <Button size="sm" disabled={pending || !amount || !accountId} onClick={handleSubmit}>{pending ? "Salvando..." : "Salvar"}</Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
