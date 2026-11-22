"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, FieldError } from "@/components/ui/input";
import { registerCardCreditAction } from "../actions";
import { cardCreditSchema } from "@/lib/validations/cards";
import { calculateInstallmentCompetences, formatMonthLabel, monthKey, todayIso } from "@/lib/utils/date";
import type { AccountDTO } from "@/types/dto";

/**
 * "Lançar crédito" — a standalone credit on the card's invoice (AI_CONTEXT.md "Crédito no Cartão"):
 * a partial/proportional refund from a merchant, a bank reimbursement, cashback… Always tagged with
 * the is_system "Crédito no Cartão" category server-side; the reason goes in the description.
 */
export function CardCreditDialog({ card, trigger }: { card: AccountDTO; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle>Lançar crédito — {card.name}</DialogTitle>
        <CardCreditForm card={card} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

/** The dialog's body — also rendered by the Cards page's "Nova movimentação" picker. */
export function CardCreditForm({ card, onDone }: { card: AccountDTO; onDone: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIso());
  const [description, setDescription] = useState("");

  const invoiceMonth =
    card.closingDay && card.dueDay && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? monthKey(calculateInstallmentCompetences(date, card.closingDay, card.dueDay, 1)[0])
      : null;

  function handleSubmit() {
    setError(null);
    const parsed = cardCreditSchema.safeParse({
      creditCardId: card.id,
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
        await registerCardCreditAction(parsed.data);
        router.refresh();
        onDone();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao lançar crédito");
      }
    });
  }

  return (
    <>
      <DialogDescription>
        Um crédito que o banco ou a loja lançou na fatura (estorno parcial, reembolso, cashback…). Abate a fatura como um pagamento e
        entra como receita na categoria Crédito no Cartão. As compras e parcelas continuam como estão.
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
      {invoiceMonth && <p className="text-xs opacity-70">Aparece na fatura de {formatMonthLabel(invoiceMonth)}.</p>}
      <Field>
        <Label>Descrição</Label>
        <Input value={description} placeholder={`Crédito no cartão ${card.name}`} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <FieldError>{error}</FieldError>
      <DialogActions>
        <DialogClose asChild><Button variant="secondary" size="sm">Cancelar</Button></DialogClose>
        <Button size="sm" disabled={pending || !amount} onClick={handleSubmit}>{pending ? "Salvando..." : "Confirmar"}</Button>
      </DialogActions>
    </>
  );
}
