"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, FieldError } from "@/components/ui/input";
import { refundCardPurchaseAction } from "../actions";
import { formatCurrency } from "@/lib/utils/currency";
import { todayIso } from "@/lib/utils/date";
import { Undo2 } from "lucide-react";
import type { CardPurchaseDTO } from "@/types/dto";

/**
 * Full refund only (AI_CONTEXT.md "Estorno") — the amount is always the purchase's own total,
 * never editable. Only the date is: the refund can genuinely happen months after the purchase,
 * so it defaults to today but the user picks whenever it actually occurred.
 */
export function RefundPurchaseDialog({ purchase }: { purchase: CardPurchaseDTO }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [refundDate, setRefundDate] = useState(todayIso());

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      try {
        await refundCardPurchaseAction({ purchaseId: purchase.id, refundDate });
        router.refresh();
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao estornar compra");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="p-1.5 -m-1.5 text-text/40 hover:text-accent" aria-label="Estornar compra">
          <Undo2 className="size-3.5" strokeWidth={1.5} />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Estornar compra</DialogTitle>
        <DialogDescription>
          {purchase.description || "Compra"} passa para a categoria &quot;Estorno&quot; e o valor é creditado de volta no cartão. Só é possível estornar o valor total.
        </DialogDescription>
        <Field>
          <Label>Valor do estorno</Label>
          <Input value={formatCurrency(purchase.totalAmount)} disabled />
        </Field>
        <Field>
          <Label>Data do estorno</Label>
          <Input type="date" value={refundDate} onChange={(e) => setRefundDate(e.target.value)} />
        </Field>
        <FieldError>{error}</FieldError>
        <DialogActions>
          <DialogClose asChild><Button variant="secondary" size="sm">Cancelar</Button></DialogClose>
          <Button size="sm" disabled={pending} onClick={handleConfirm}>{pending ? "Estornando..." : "Confirmar estorno"}</Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
