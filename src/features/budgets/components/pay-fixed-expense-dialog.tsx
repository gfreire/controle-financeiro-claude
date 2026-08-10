"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { AccountSelect } from "@/components/ui/account-select";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, FieldError } from "@/components/ui/input";
import { payFixedExpenseAction, cancelFixedExpensePaymentAction } from "../actions";
import { todayIso, formatDate } from "@/lib/utils/date";
import { formatCurrency } from "@/lib/utils/currency";
import type { AccountDTO, FixedExpenseDTO } from "@/types/dto";

export function PayFixedExpenseDialog({ expense, accounts, month, trigger }: { expense: FixedExpenseDTO; accounts: AccountDTO[]; month: string; trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState(expense.defaultAccountId ?? accounts[0]?.id ?? "");
  const [amount, setAmount] = useState(String(expense.plannedAmount));
  const [date, setDate] = useState(todayIso());
  const selectedAccount = accounts.find((a) => a.id === accountId);
  const isCreditCard = selectedAccount?.type === "CREDIT_CARD";

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
          subcategoryId: expense.subcategoryId,
        });
        router.refresh();
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao registrar pagamento");
      }
    });
  }

  function handleCancelPayment() {
    setError(null);
    startTransition(async () => {
      try {
        await cancelFixedExpensePaymentAction(expense.id, month);
        router.refresh();
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao cancelar pagamento");
      }
    });
  }

  if (expense.isPaidThisMonth) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent>
          <DialogTitle>Pagamento — {expense.name}</DialogTitle>
          <p className="text-sm">
            {expense.name} pago no valor de {formatCurrency(expense.actualAmount)}
            {expense.paidDate ? ` no dia ${formatDate(expense.paidDate)}` : ""}.
          </p>
          <FieldError>{error}</FieldError>
          <DialogActions>
            <Button variant="danger" size="sm" disabled={pending} onClick={handleCancelPayment}>
              {pending ? "Cancelando..." : "Cancelar pagamento"}
            </Button>
            <DialogClose asChild><Button size="sm">OK</Button></DialogClose>
          </DialogActions>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle>Registrar pagamento — {expense.name}</DialogTitle>
        <Field>
          <Label>Conta</Label>
          <AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field>
            <Label>Valor</Label>
            <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field>
            <Label>{isCreditCard ? "Data da compra" : "Data"}</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        {isCreditCard && (
          <p className="-mt-1 text-[11px] opacity-50">
            Lançado como uma compra de 1x no cartão — a competência segue o fechamento da fatura (pode cair no mês seguinte).
          </p>
        )}
        <FieldError>{error}</FieldError>
        <DialogActions>
          <DialogClose asChild><Button variant="secondary" size="sm">Cancelar</Button></DialogClose>
          <Button size="sm" disabled={pending} onClick={handleSubmit}>{pending ? "Salvando..." : "Confirmar"}</Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
