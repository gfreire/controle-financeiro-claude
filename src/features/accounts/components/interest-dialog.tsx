"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, FieldError } from "@/components/ui/input";
import { registerInterestAction } from "../actions";
import { registerInterestSchema } from "@/lib/validations/accounts";
import { todayIso } from "@/lib/utils/date";
import { roundMoney } from "@/lib/utils/money";
import type { AccountDTO } from "@/types/dto";

/**
 * "Lançar Juros" — a dedicated entry point for interest, the same shape as "Informar Rendimento":
 * click, type (or compute) the value, the system logs it already tagged `Juros` (see
 * accounts.service.ts#registerInterest). `Juros` is never pickable from a category dropdown.
 * Shown on BANK accounts (overdraft interest) and in the Cards page's "Fatura" menu (the invoice's
 * interest line). The optional base × % calculator mirrors debt-transaction-dialog.tsx — it just
 * fills the amount field once, not a reactive two-way binding.
 */
export function InterestDialog({ account, trigger }: { account: AccountDTO; trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIso());
  const [base, setBase] = useState("");
  const [percentage, setPercentage] = useState("");

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setAmount("");
      setDate(todayIso());
      setBase("");
      setPercentage("");
      setError(null);
    }
  }

  function recalc(nextBase: string, nextPct: string) {
    const b = Number(nextBase);
    const p = Number(nextPct);
    if (nextBase && nextPct && Number.isFinite(b) && Number.isFinite(p)) {
      setAmount(String(roundMoney(b * (p / 100))));
    }
  }

  function handleSubmit() {
    setError(null);
    const parsed = registerInterestSchema.safeParse({ accountId: account.id, amount: Number(amount), date });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    startTransition(async () => {
      try {
        await registerInterestAction(parsed.data);
        router.refresh();
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao lançar");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle>Lançar Juros</DialogTitle>
        <DialogDescription>
          {account.type === "CREDIT_CARD"
            ? "Lança a linha de juros da fatura como uma compra à vista categorizada Juros."
            : "Lança o valor como uma despesa categorizada Juros (ex.: juros de cheque especial)."}
        </DialogDescription>
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
          <Label>Calcular (opcional)</Label>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="Base"
              value={base}
              onChange={(e) => { setBase(e.target.value); recalc(e.target.value, percentage); }}
            />
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="%"
              value={percentage}
              onChange={(e) => { setPercentage(e.target.value); recalc(base, e.target.value); }}
            />
          </div>
          <p className="mt-1 text-[11px] opacity-50">Preenche o valor com base × porcentagem — ainda editável.</p>
        </Field>
        <FieldError>{error}</FieldError>
        <DialogActions>
          <DialogClose asChild><Button variant="secondary" size="sm">Cancelar</Button></DialogClose>
          <Button size="sm" disabled={pending || !amount} onClick={handleSubmit}>{pending ? "Salvando..." : "Confirmar"}</Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
