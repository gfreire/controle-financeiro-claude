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
 */
export function LimitAdjustDialog({ account, trigger }: { account: AccountDTO; trigger: React.ReactNode }) {
  const router = useRouter();
  const isCard = account.type === "CREDIT_CARD";
  const currentLimit = isCard ? (account.creditLimit ?? null) : (account.overdraftLimit ?? 0);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(currentLimit === null ? "" : String(currentLimit));

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
    startTransition(async () => {
      try {
        await updateAccountAction(account.id, isCard ? { creditLimit: value } : { overdraftLimit: value ?? 0 });
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
        <DialogTitle>Ajustar Limite</DialogTitle>
        <DialogDescription>
          {isCard
            ? "Limite do cartão — opcional, apenas gera um aviso soft ao ultrapassar, nunca bloqueia um lançamento."
            : "Limite de cheque especial da conta."}
        </DialogDescription>
        <Field>
          <Label>{isCard ? "Limite do cartão" : "Limite de cheque especial"}</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            placeholder={isCard ? "Deixe em branco para remover o alerta de limite" : undefined}
          />
        </Field>
        {currentLimit !== null && (
          <p className="text-xs opacity-70">Limite atual: <strong>{formatCurrency(currentLimit)}</strong></p>
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
