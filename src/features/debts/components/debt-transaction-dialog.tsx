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
import { formatCurrency } from "@/lib/utils/currency";
import { addMoney } from "@/lib/utils/money";
import type { AccountDTO } from "@/types/dto";

export function DebtTransactionDialog({
  debtId,
  debtName,
  currentBalance,
  mode,
  accounts,
  trigger,
}: {
  debtId: string;
  debtName: string;
  currentBalance: number;
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
  const [description, setDescription] = useState(`Movimentação da dívida ${debtName}`);
  const [createLinkedTransaction, setCreateLinkedTransaction] = useState(true);
  const [linkedAccountId, setLinkedAccountId] = useState(accounts[0]?.id ?? "");
  const [confirmingSettle, setConfirmingSettle] = useState(false);

  const numericAmount = Number(amount);
  const signedAmount = mode === "payment" ? -Math.abs(numericAmount) : Math.abs(numericAmount);
  const projectedBalance = Number.isFinite(numericAmount) && amount ? addMoney(currentBalance, signedAmount) : currentBalance;
  const willSettle = mode === "payment" && amount !== "" && projectedBalance <= 0;
  const isOverpayment = willSettle && projectedBalance < 0;

  function resetAndClose() {
    setOpen(false);
    setAmount("");
    setDescription(`Movimentação da dívida ${debtName}`);
    setConfirmingSettle(false);
  }

  function handleSubmit() {
    setError(null);

    // Paying off (or overpaying) a debt fully settles it — see AI_CONTEXT.md "Dívidas": the
    // debt gets soft-deleted server-side once its balance reaches zero, so we warn before
    // submitting instead of surprising the user when it silently disappears from the list.
    if (willSettle && !confirmingSettle) {
      setConfirmingSettle(true);
      return;
    }

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
        resetAndClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao lançar");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) resetAndClose(); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle>{mode === "payment" ? "Registrar pagamento" : "Registrar novo valor"}</DialogTitle>
        <div className="grid grid-cols-2 gap-2">
          <Field>
            <Label>Valor</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setConfirmingSettle(false); }}
            />
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
        {willSettle && confirmingSettle && (
          <p className="border border-warning-500 bg-warning-100 p-2 text-xs text-warning-700">
            {isOverpayment
              ? `Você está pagando ${formatCurrency(Math.abs(projectedBalance))} a mais que o saldo devido (${formatCurrency(currentBalance)}) — pode ser juros ou um acerto intencional. Confirmando, o pagamento é registrado e a dívida com ${debtName} é quitada e sai da listagem.`
              : `Este pagamento quita a dívida com ${debtName} — ela será marcada como quitada e removida da listagem.`}
          </p>
        )}
        <FieldError>{error}</FieldError>
        <DialogActions>
          <DialogClose asChild><Button variant="secondary" size="sm">Cancelar</Button></DialogClose>
          <Button size="sm" disabled={pending || !amount} onClick={handleSubmit}>
            {pending ? "Salvando..." : willSettle && confirmingSettle ? "Confirmar quitação" : "Confirmar"}
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
