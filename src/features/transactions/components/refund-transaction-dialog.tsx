"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, FieldError } from "@/components/ui/input";
import { refundTransactionAction } from "../actions";
import { formatCurrency } from "@/lib/utils/currency";
import { todayIso } from "@/lib/utils/date";
import { Undo2 } from "lucide-react";

/**
 * Full refund only (AI_CONTEXT.md "Estorno") — amount is always the original expense's own
 * value, never editable. Only the date is, since the refund can genuinely land months after the
 * original expense; defaults to today.
 */
export function RefundTransactionDialog({ transactionId, description, amount }: { transactionId: string; description: string; amount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [refundDate, setRefundDate] = useState(todayIso());

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      try {
        await refundTransactionAction({ transactionId, refundDate });
        router.refresh();
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao estornar lançamento");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {/* Real padding, no negative margin — see delete-transaction-button.tsx for why: these
            sit in a row of up to three, and a negative margin would let hit zones overlap with
            the later (more destructive) button winning taps aimed at this one. */}
        <button className="p-2.5 text-text/40 hover:text-accent" aria-label="Estornar lançamento">
          <Undo2 className="size-3.5" strokeWidth={1.5} />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Estornar lançamento</DialogTitle>
        <DialogDescription>
          {description || "Este lançamento"} passa para a categoria &quot;Estorno&quot; e uma nova receita é criada de volta na mesma conta. Só é possível estornar o valor total.
        </DialogDescription>
        <Field>
          <Label>Valor do estorno</Label>
          <Input value={formatCurrency(amount)} disabled />
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
