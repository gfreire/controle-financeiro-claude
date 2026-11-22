"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, FieldError } from "@/components/ui/input";
import { registerCardPaymentAction } from "../actions";
import { cardPaymentSchema } from "@/lib/validations/cards";
import { todayIso } from "@/lib/utils/date";
import { formatCurrency } from "@/lib/utils/currency";
import { AccountBalanceHint } from "@/components/ui/account-select";
import type { AccountDTO } from "@/types/dto";

export function PaymentFormDialog({
  card,
  payerAccounts,
  statementBalance,
  trigger,
}: {
  card: AccountDTO;
  payerAccounts: AccountDTO[];
  /** Sum of installments due through the current month, minus payments already made — what's actually on the bill, not the full future balance. */
  statementBalance: number;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle>Pagar fatura — {card.name}</DialogTitle>
        <PaymentForm card={card} payerAccounts={payerAccounts} statementBalance={statementBalance} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

/** The dialog's body — also rendered by the "Nova movimentação" picker on /cards. Radix unmounts
 * the content on close, so the initial state below is always fresh on open. */
export function PaymentForm({
  card,
  payerAccounts,
  statementBalance,
  onDone,
}: {
  card: AccountDTO;
  payerAccounts: AccountDTO[];
  statementBalance: number;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState(payerAccounts[0]?.id ?? "");
  const [amount, setAmount] = useState(String(statementBalance));
  const [paymentDate, setPaymentDate] = useState(todayIso());


  function handleSubmit() {
    setError(null);
    const parsed = cardPaymentSchema.safeParse({ creditCardId: card.id, accountId, amount: Number(amount), paymentDate });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    startTransition(async () => {
      try {
        await registerCardPaymentAction(parsed.data);
        router.refresh();
        onDone();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao registrar pagamento");
      }
    });
  }

  return (
    <>
        <p className="text-xs opacity-70">Fatura até o mês atual: <strong>{formatCurrency(statementBalance)}</strong></p>
        <Field>
          <Label>Conta pagadora</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {payerAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <AccountBalanceHint accounts={payerAccounts} accountId={accountId} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field>
            <Label>Valor</Label>
            <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field>
            <Label>Data do pagamento</Label>
            <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
          </Field>
        </div>
        <FieldError>{error}</FieldError>
        <DialogActions>
          <DialogClose asChild><Button variant="secondary" size="sm">Cancelar</Button></DialogClose>
          <Button size="sm" disabled={pending || !accountId || !amount} onClick={handleSubmit}>{pending ? "Salvando..." : "Confirmar"}</Button>
        </DialogActions>
    </>
  );
}
