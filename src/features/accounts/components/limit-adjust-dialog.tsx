"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, FieldError } from "@/components/ui/input";
import { updateAccountAction } from "../actions";
import { formatCurrency } from "@/lib/utils/currency";
import type { AccountDTO } from "@/types/dto";

/**
 * Lets credit_limit (CREDIT_CARD) or overdraft_limit (BANK) be changed at any time — banks
 * routinely raise or cut these outside the user's control (see AI_CONTEXT.md "Accounts").
 * Soft-enforced only: changing the limit never rewrites past purchases/warnings, only the
 * threshold used for future soft-limit checks.
 *
 * For CREDIT_CARD accounts this same dialog also edits closing_day/due_day — the invoice
 * closing/due dates are just as subject to change by the bank as the limit is, and both
 * live on the same `credit_cards` extension row, so a single quick-action dialog (mirroring
 * "Ajustar Saldo") covers all three instead of needing a separate flow per field.
 */
export function LimitAdjustDialog({ account, trigger }: { account: AccountDTO; trigger: React.ReactNode }) {
  const router = useRouter();
  const isCard = account.type === "CREDIT_CARD";
  const currentLimit = isCard ? (account.creditLimit ?? null) : (account.overdraftLimit ?? 0);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(currentLimit === null ? "" : String(currentLimit));
  const [closingDay, setClosingDay] = useState(String(account.closingDay ?? ""));
  const [dueDay, setDueDay] = useState(String(account.dueDay ?? ""));

  function handleSubmit() {
    setError(null);
    const value = limit.trim() === "" ? null : Number(limit);
    if (value !== null && !Number.isFinite(value)) {
      setError("Informe um valor válido");
      return;
    }
    if (value !== null && value < 0) {
      setError("O limite não pode ser negativo");
      return;
    }
    if (!isCard && value === null) {
      setError("Informe um valor válido");
      return;
    }
    if (isCard && (value === null || value <= 0)) {
      setError("O limite do cartão é obrigatório e deve ser maior que zero");
      return;
    }

    let closingDayValue: number | undefined;
    let dueDayValue: number | undefined;
    if (isCard) {
      closingDayValue = Number(closingDay);
      dueDayValue = Number(dueDay);
      if (!Number.isInteger(closingDayValue) || closingDayValue < 1 || closingDayValue > 31) {
        setError("Dia de fechamento deve ser entre 1 e 31");
        return;
      }
      if (!Number.isInteger(dueDayValue) || dueDayValue < 1 || dueDayValue > 31) {
        setError("Dia de vencimento deve ser entre 1 e 31");
        return;
      }
    }

    startTransition(async () => {
      try {
        await updateAccountAction(
          account.id,
          isCard ? { creditLimit: value, closingDay: closingDayValue, dueDay: dueDayValue } : { overdraftLimit: value ?? 0 }
        );
        router.refresh();
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao salvar");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle>{isCard ? "Ajustar Cartão" : "Ajustar Limite"}</DialogTitle>
        <DialogDescription>
          {isCard
            ? "Limite, fechamento e vencimento da fatura — o banco pode alterar qualquer um deles a qualquer momento."
            : "Limite de cheque especial da conta."}
        </DialogDescription>
        <Field>
          <Label>{isCard ? "Limite do cartão" : "Limite de cheque especial"}</Label>
          <Input
            type="number"
            step="0.01"
            min={isCard ? "0.01" : "0"}
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
          />
        </Field>
        {currentLimit !== null && (
          <p className="text-xs opacity-70">Limite atual: <strong>{formatCurrency(currentLimit)}</strong></p>
        )}
        {isCard && (
          <div className="flex gap-3">
            <Field className="flex-1">
              <Label>Dia de fechamento</Label>
              <Input type="number" min="1" max="31" value={closingDay} onChange={(e) => setClosingDay(e.target.value)} />
            </Field>
            <Field className="flex-1">
              <Label>Dia de vencimento</Label>
              <Input type="number" min="1" max="31" value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
            </Field>
          </div>
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
