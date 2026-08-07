"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, FieldError } from "@/components/ui/input";
import { payFixedExpenseAction } from "../actions";
import { todayIso } from "@/lib/utils/date";
import type { AccountDTO, FixedExpenseDTO } from "@/types/dto";

export function PayFixedExpenseDialog({ expense, accounts, trigger }: { expense: FixedExpenseDTO; accounts: AccountDTO[]; trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState(expense.defaultAccountId ?? accounts[0]?.id ?? "");
  const [amount, setAmount] = useState(String(expense.plannedAmount));
  const [date, setDate] = useState(todayIso());

  function handleSubmit() {
    setError(null);
    const value = Number(amount);
    if (!accountId || !Number.isFinite(value) || value <= 0) {
      setError("Preencha conta e valor corretamente");
      return;
    }
    startTransition(async () => {
      try {
        await payFixedExpenseAction({
          fixedExpenseId: expense.id,
          originAccountId: accountId,
          amount: value,
          date,
          description: `Pagamento — ${expense.name}`,
          categoryId: expense.categoryId,
        });
        router.refresh();
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao registrar pagamento");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle>Registrar pagamento — {expense.name}</DialogTitle>
        <Field>
          <Label>Conta</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field>
            <Label>Valor</Label>
            <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field>
            <Label>Data</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <FieldError>{error}</FieldError>
        <DialogActions>
          <DialogClose asChild><Button variant="secondary" size="sm">Cancelar</Button></DialogClose>
          <Button size="sm" disabled={pending} onClick={handleSubmit}>{pending ? "Salvando..." : "Confirmar"}</Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
