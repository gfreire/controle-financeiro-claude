"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, FieldError } from "@/components/ui/input";
import { addDebtTransactionAction } from "../actions";
import { debtTransactionSchema } from "@/lib/validations/debts";
import { todayIso } from "@/lib/utils/date";
import type { AccountDTO } from "@/types/dto";

export function DebtTransactionDialog({
  debtId,
  mode,
  accounts,
  trigger,
}: {
  debtId: string;
  mode: "increase" | "payment";
  accounts: AccountDTO[];
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(todayIso());
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [createLinkedTransaction, setCreateLinkedTransaction] = useState(true);
  const [linkedAccountId, setLinkedAccountId] = useState(accounts[0]?.id ?? "");

  function handleSubmit() {
    setError(null);
    const signedAmount = mode === "payment" ? -Math.abs(Number(amount)) : Math.abs(Number(amount));
    const parsed = debtTransactionSchema.safeParse({
      debtId,
      date,
      amount: signedAmount,
      description: description || undefined,
      createLinkedTransaction,
      linkedAccountId: createLinkedTransaction ? linkedAccountId : undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    startTransition(async () => {
      try {
        await addDebtTransactionAction(parsed.data);
        router.refresh();
        setOpen(false);
        setAmount(""); setDescription("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao lançar");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle>{mode === "payment" ? "Registrar pagamento" : "Registrar novo valor"}</DialogTitle>
        <div className="grid grid-cols-2 gap-2">
          <Field>
            <Label>Valor</Label>
            <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field>
            <Label>Data</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field>
          <Label>Descrição</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={createLinkedTransaction} onCheckedChange={setCreateLinkedTransaction} />
          Dinheiro passou por uma conta rastreada
        </label>
        {createLinkedTransaction && (
          <Field>
            <Label>Conta</Label>
            <Select value={linkedAccountId} onValueChange={setLinkedAccountId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        )}
        <FieldError>{error}</FieldError>
        <DialogActions>
          <DialogClose asChild><Button variant="secondary" size="sm">Cancelar</Button></DialogClose>
          <Button size="sm" disabled={pending || !amount} onClick={handleSubmit}>{pending ? "Salvando..." : "Confirmar"}</Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
