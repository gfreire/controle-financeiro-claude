"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, FieldError } from "@/components/ui/input";
import { registerYieldAction, reconcileBalanceAction } from "../actions";
import { formatCurrency } from "@/lib/utils/currency";
import { addMoney, subtractMoney } from "@/lib/utils/money";
import type { AccountDTO } from "@/types/dto";

export function BalanceAdjustDialog({ account, mode, trigger }: { account: AccountDTO; mode: "yield" | "reconcile"; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle>{mode === "yield" ? "Informar Rendimento" : "Ajustar Saldo"}</DialogTitle>
        <BalanceAdjustForm account={account} mode={mode} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

/** The dialog's body — also rendered by the "Nova movimentação" picker on /transactions. Radix
 * unmounts the content on close, so state starts fresh on every open. */
export function BalanceAdjustForm({ account, mode, onDone }: { account: AccountDTO; mode: "yield" | "reconcile"; onDone: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Two optional, linked fields: the real balance and the difference itself (the yield, or the
  // adjustment). Typing in either recomputes the other against the calculated balance, so the user
  // can enter whichever number they actually have. The server contract stays `realBalance`.
  const [realBalance, setRealBalance] = useState("");
  const [difference, setDifference] = useState("");


  function handleRealBalanceChange(raw: string) {
    setRealBalance(raw);
    const value = Number(raw);
    setDifference(raw.trim() !== "" && Number.isFinite(value) ? String(subtractMoney(value, account.balance)) : "");
  }

  function handleDifferenceChange(raw: string) {
    setDifference(raw);
    const value = Number(raw);
    setRealBalance(raw.trim() !== "" && Number.isFinite(value) ? String(addMoney(account.balance, value)) : "");
  }

  function handleSubmit() {
    setError(null);
    const value = Number(realBalance);
    if (realBalance.trim() === "" || !Number.isFinite(value)) {
      setError(mode === "yield" ? "Informe o saldo real ou o valor do rendimento" : "Informe o saldo real ou a diferença");
      return;
    }
    startTransition(async () => {
      try {
        if (mode === "yield") await registerYieldAction(account.id, value);
        else await reconcileBalanceAction(account.id, value);
        router.refresh();
        onDone();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao salvar");
      }
    });
  }

  const delta = realBalance.trim() === "" ? NaN : subtractMoney(Number(realBalance), account.balance);

  return (
    <>
        <DialogDescription>
          {mode === "yield"
            ? "Para rendimento rotineiro e esperado — lança a diferença como Rendimentos."
            : "Para diferenças que não são rendimento plausível — lança a diferença como Ajuste."}
          {" "}Saldo calculado atual: <strong>{formatCurrency(account.balance)}</strong>.
        </DialogDescription>
        <Field>
          <Label>{mode === "yield" ? "Valor do rendimento" : "Diferença"}</Label>
          <Input type="number" step="0.01" value={difference} placeholder="0,00" onChange={(e) => handleDifferenceChange(e.target.value)} />
        </Field>
        <Field>
          <Label>Saldo real atual</Label>
          <Input type="number" step="0.01" value={realBalance} placeholder={String(account.balance)} onChange={(e) => handleRealBalanceChange(e.target.value)} />
        </Field>
        <p className="text-xs opacity-70">Preencha um dos dois — o outro é calculado automaticamente.</p>
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
    </>
  );
}
