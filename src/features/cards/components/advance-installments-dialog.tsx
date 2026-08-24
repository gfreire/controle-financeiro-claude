"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, FieldError } from "@/components/ui/input";
import { advancePurchaseInstallmentsAction } from "../actions";
import { FastForward } from "lucide-react";
import type { CardPurchaseDTO } from "@/types/dto";

/**
 * "Antecipar parcelas" (AI_CONTEXT.md "Antecipar parcelas") — remaneja competência, nunca cria
 * pagamento. O usuário escolhe quantas das próximas parcelas ainda não faturadas quer trazer pra
 * fatura aberta agora; as demais são renumeradas em sequência logo em seguida. Pra de fato pagar
 * as parcelas antecipadas (agora na fatura corrente), o fluxo normal é "Pagar fatura".
 */
export function AdvanceInstallmentsDialog({ purchase }: { purchase: CardPurchaseDTO }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(String(purchase.remainingInstallmentsCount));

  function handleConfirm() {
    setError(null);
    const parsedCount = Number(count);
    if (!Number.isInteger(parsedCount) || parsedCount < 1 || parsedCount > purchase.remainingInstallmentsCount) {
      setError(`Escolha entre 1 e ${purchase.remainingInstallmentsCount} parcelas`);
      return;
    }
    startTransition(async () => {
      try {
        await advancePurchaseInstallmentsAction({ purchaseId: purchase.id, count: parsedCount });
        router.refresh();
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao antecipar parcelas");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="p-1.5 -m-1.5 text-text/40 hover:text-accent" aria-label="Antecipar parcelas">
          <FastForward className="size-3.5" strokeWidth={1.5} />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Antecipar parcelas</DialogTitle>
        <DialogDescription>
          Traz as próximas parcelas de &quot;{purchase.description || "compra"}&quot; pra fatura aberta agora — as demais continuam em sequência logo depois, sem pular mês. Isso não paga nada sozinho; pra quitar, use &quot;Pagar fatura&quot; normalmente depois.
        </DialogDescription>
        <p className="text-xs opacity-70">
          Restam <strong>{purchase.remainingInstallmentsCount}</strong> parcela(s) ainda não faturadas.
        </p>
        <Field>
          <Label>Quantas parcelas antecipar</Label>
          <Input type="number" min={1} max={purchase.remainingInstallmentsCount} value={count} onChange={(e) => setCount(e.target.value)} />
        </Field>
        <FieldError>{error}</FieldError>
        <DialogActions>
          <DialogClose asChild><Button variant="secondary" size="sm">Cancelar</Button></DialogClose>
          <Button size="sm" disabled={pending} onClick={handleConfirm}>{pending ? "Antecipando..." : "Confirmar"}</Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
