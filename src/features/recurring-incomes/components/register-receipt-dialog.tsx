"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { AccountSelect } from "@/components/ui/account-select";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, FieldError } from "@/components/ui/input";
import { registerReceiptAction, cancelReceiptAction } from "../actions";
import { todayIso, formatDate } from "@/lib/utils/date";
import { formatCurrency } from "@/lib/utils/currency";
import type { AccountDTO, RecurringIncomeDTO } from "@/types/dto";

/**
 * Mirror of PayFixedExpenseDialog: branches on `income.receivedThisMonth`. Not received → an
 * account / amount / date form that creates the real INCOME transaction. Received → a plain
 * summary + "Cancelar recebimento" (deletes that month's linked transaction).
 */
export function RegisterReceiptDialog({
  income,
  accounts,
  month,
  trigger,
}: {
  income: RecurringIncomeDTO;
  accounts: AccountDTO[];
  month: string;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const liquidAccounts = accounts.filter((a) => a.type !== "CREDIT_CARD");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState(income.defaultAccountId ?? liquidAccounts[0]?.id ?? "");
  const [amount, setAmount] = useState(String(income.plannedAmount));
  const [date, setDate] = useState(todayIso());

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setAccountId(income.defaultAccountId ?? liquidAccounts[0]?.id ?? "");
      setAmount(String(income.plannedAmount));
      setDate(todayIso());
      setError(null);
    }
  }

  function handleRegister() {
    setError(null);
    startTransition(async () => {
      try {
        await registerReceiptAction({
          recurringIncomeId: income.id,
          accountId,
          amount: Number(amount),
          date,
        });
        router.refresh();
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao registrar recebimento");
      }
    });
  }

  function handleCancel() {
    setError(null);
    startTransition(async () => {
      try {
        await cancelReceiptAction(income.id, month);
        router.refresh();
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao cancelar recebimento");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        {income.receivedThisMonth ? (
          <>
            <DialogTitle>Recebimento — {income.name}</DialogTitle>
            <p className="text-sm opacity-80">
              {income.name} recebido no valor de {formatCurrency(income.receivedAmount)}
              {income.receivedDate ? ` em ${formatDate(income.receivedDate)}` : ""}.
            </p>
            <FieldError>{error}</FieldError>
            <DialogActions>
              <DialogClose asChild><Button variant="secondary" size="sm">OK</Button></DialogClose>
              <Button size="sm" variant="secondary" disabled={pending} onClick={handleCancel}>
                {pending ? "Cancelando..." : "Cancelar recebimento"}
              </Button>
            </DialogActions>
          </>
        ) : (
          <>
            <DialogTitle>Registrar recebimento — {income.name}</DialogTitle>
            <Field>
              <Label>Conta</Label>
              <AccountSelect accounts={liquidAccounts} value={accountId} onChange={setAccountId} />
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
            <FieldError>{error}</FieldError>
            <DialogActions>
              <DialogClose asChild><Button variant="secondary" size="sm">Cancelar</Button></DialogClose>
              <Button size="sm" disabled={pending || !accountId || !amount} onClick={handleRegister}>
                {pending ? "Salvando..." : "Registrar"}
              </Button>
            </DialogActions>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
