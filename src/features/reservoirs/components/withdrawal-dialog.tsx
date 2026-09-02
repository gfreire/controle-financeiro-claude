"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { AccountSelect, AccountBalanceHint } from "@/components/ui/account-select";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, FieldError } from "@/components/ui/input";
import { withdrawReservoirAction } from "../actions";
import { reservoirWithdrawalSchema } from "@/lib/validations/reservoirs";
import { todayIso } from "@/lib/utils/date";
import type { AccountDTO } from "@/types/dto";

export function WithdrawalDialog({
  reservoirId,
  accounts,
  defaultDestinationAccountId,
  trigger,
}: {
  reservoirId: string;
  accounts: AccountDTO[];
  defaultDestinationAccountId?: string;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(todayIso());
  const [amount, setAmount] = useState("");
  const [destinationAccountId, setDestinationAccountId] = useState(defaultDestinationAccountId ?? accounts[0]?.id ?? "");

  // See category-form-dialog.tsx for why this is needed and why it's a render-phase adjustment,
  // not an Effect: the dialog stays mounted across parent re-renders, so the useState
  // initializer above never sees a fresher `defaultDestinationAccountId` (e.g. changed via the
  // reservoir's own edit form while this dialog was closed).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setDestinationAccountId(defaultDestinationAccountId ?? accounts[0]?.id ?? "");
  }

  function handleSubmit() {
    setError(null);
    const parsed = reservoirWithdrawalSchema.safeParse({ reservoirId, date, amount: Number(amount), destinationAccountId });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    startTransition(async () => {
      try {
        await withdrawReservoirAction(parsed.data);
        router.refresh();
        setOpen(false);
        setAmount("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao registrar saque");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle>Sacar da receita programada</DialogTitle>
        <p className="text-xs opacity-70">O valor sacado não precisa bater exatamente com o acumulado — a diferença fica no saldo.</p>
        <Field>
          <Label>Conta de destino</Label>
          <AccountSelect accounts={accounts} value={destinationAccountId} onChange={setDestinationAccountId} />
          <AccountBalanceHint accounts={accounts} accountId={destinationAccountId} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field>
            <Label>Valor recebido</Label>
            <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field>
            <Label>Data</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <FieldError>{error}</FieldError>
        <DialogActions>
          <DialogClose asChild><Button variant="secondary" size="sm">Cancelar</Button></DialogClose>
          <Button size="sm" disabled={pending || !amount || !destinationAccountId} onClick={handleSubmit}>{pending ? "Salvando..." : "Confirmar"}</Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
