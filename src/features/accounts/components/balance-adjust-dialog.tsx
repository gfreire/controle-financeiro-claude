"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, FieldError } from "@/components/ui/input";
import { registerYieldAction, reconcileBalanceAction } from "../actions";
import { formatCurrency } from "@/lib/utils/currency";
import type { AccountDTO } from "@/types/dto";

export function BalanceAdjustDialog({ account, mode, trigger }: { account: AccountDTO; mode: "yield" | "reconcile"; trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [realBalance, setRealBalance] = useState(String(account.balance));

  // See category-form-dialog.tsx for why this is needed and why it's a render-phase adjustment,
  // not an Effect: the dialog stays mounted across parent re-renders, so the useState
  // initializer above never sees a fresher `account.balance` (e.g. a transaction logged
  // elsewhere just moved it before this dialog was reopened).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setRealBalance(String(account.balance));
  }

  function handleSubmit() {
    setError(null);
    const value = Number(realBalance);
    if (!Number.isFinite(value)) {
      setError("Informe um valor válido");
      return;
    }
    startTransition(async () => {
      try {
        if (mode === "yield") await registerYieldAction(account.id, value);
        else await reconcileBalanceAction(account.id, value);
        router.refresh();
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao salvar");
      }
    });
  }

  const delta = Number(realBalance) - account.balance;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle>{mode === "yield" ? "Informar Rendimento" : "Ajustar Saldo"}</DialogTitle>
        <DialogDescription>
          {mode === "yield"
            ? "Para rendimento rotineiro e esperado — lança a diferença como Rendimentos."
            : "Para diferenças que não são rendimento plausível — lança a diferença como Ajuste."}
          {" "}Saldo calculado atual: <strong>{formatCurrency(account.balance)}</strong>.
        </DialogDescription>
        <Field>
          <Label>Saldo real atual</Label>
          <Input type="number" step="0.01" value={realBalance} onChange={(e) => setRealBalance(e.target.value)} />
        </Field>
        {Number.isFinite(delta) && delta !== 0 && (
          <p className="text-xs opacity-70">
            Será lançado: <strong className={delta > 0 ? "text-success-600" : "text-danger-600"}>{formatCurrency(delta)}</strong>
          </p>
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
