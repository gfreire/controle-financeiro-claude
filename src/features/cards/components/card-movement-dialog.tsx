"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Field, Label } from "@/components/ui/input";
import { Plus } from "lucide-react";
import { PurchaseForm } from "./purchase-form-dialog";
import { PaymentForm } from "./payment-form-dialog";
import { CardCreditForm } from "./card-credit-dialog";
import { InterestForm } from "@/features/accounts/components/interest-dialog";
import type { AccountDTO, CategoryDTO } from "@/types/dto";

type MovementKind = "PURCHASE" | "INTEREST" | "CREDIT" | "PAYMENT";

const KIND_LABEL: Record<MovementKind, string> = {
  PURCHASE: "Compra",
  INTEREST: "Informar Juros",
  CREDIT: "Lançar Crédito",
  PAYMENT: "Pagar Fatura",
};

/**
 * The Cards page's "Nova movimentação" button: one dialog whose first field picks which card flow
 * to run — the same forms as "Nova compra" and the "Fatura ▾" menu, just reachable from one place.
 * "Compra" has its own card picker; the other three get the shared one below.
 */
export function CardMovementDialog({
  cards,
  cardTotals,
  statementBalances,
  payerAccounts,
  categories,
}: {
  cards: AccountDTO[];
  cardTotals: Record<string, number>;
  /** cardId -> getCardBalanceThroughMonth(cardId, today's month) — the "Pagar fatura" suggestion. */
  statementBalances: Record<string, number>;
  payerAccounts: AccountDTO[];
  categories: CategoryDTO[];
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<MovementKind>("PURCHASE");
  const [cardId, setCardId] = useState(cards[0]?.id ?? "");
  const card = cards.find((c) => c.id === cardId);
  const close = () => setOpen(false);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setKind("PURCHASE");
      setCardId(cards[0]?.id ?? "");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={cards.length === 0}><Plus className="size-3.5" strokeWidth={1.5} /> Nova movimentação</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Nova movimentação</DialogTitle>
        <Field>
          <Label>Tipo de movimentação</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as MovementKind)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(KIND_LABEL) as MovementKind[]).map((k) => <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>

        {kind !== "PURCHASE" && (
          <Field>
            <Label>Cartão</Label>
            <Select value={cardId} onValueChange={setCardId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {cards.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        )}

        {/* key remounts the form on a card switch, so its initial state (e.g. the suggested
            payment amount) follows the newly picked card. */}
        {kind === "PURCHASE" && <PurchaseForm cards={cards} cardTotals={cardTotals} categories={categories} onDone={close} />}
        {kind === "INTEREST" && card && <InterestForm key={card.id} account={card} onDone={close} />}
        {kind === "CREDIT" && card && <CardCreditForm key={card.id} card={card} onDone={close} />}
        {kind === "PAYMENT" && card && (
          <PaymentForm key={card.id} card={card} payerAccounts={payerAccounts} statementBalance={statementBalances[card.id] ?? 0} onDone={close} />
        )}
      </DialogContent>
    </Dialog>
  );
}
