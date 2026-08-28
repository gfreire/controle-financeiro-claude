"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, FieldError } from "@/components/ui/input";
import { updateAccountAction } from "../actions";
import { formatCurrency } from "@/lib/utils/currency";
import type { AccountDTO, FinancialInstitutionDTO } from "@/types/dto";

const NONE = "NONE";

/**
 * "Editar Conta" (CASH/BANK) / "Editar Cartão" (CREDIT_CARD) — the account's editable fields in
 * one quick-action dialog off the account card, since there's no full account-edit form.
 *
 * Name and institution rarely change, but they can (a card reissued under a new brand, a typo at
 * creation) and there was no other way to fix them. The type-specific fields are the more common
 * reason to open this: credit_limit (CREDIT_CARD) / overdraft_limit (BANK), plus closing_day/
 * due_day for a card — banks routinely raise or cut limits and shift invoice dates outside the
 * user's control (see AI_CONTEXT.md "Accounts"). Soft-enforced only: changing a limit never
 * rewrites past purchases/warnings, only the threshold used for future soft-limit checks.
 *
 * For CASH accounts this is name-only: cash in hand has no institution (deliberately hidden, same
 * as the create form) and no limit, so the dialog collapses to just the name field.
 */
export function LimitAdjustDialog({
  account,
  institutions,
  trigger,
}: {
  account: AccountDTO;
  institutions: FinancialInstitutionDTO[];
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const isCard = account.type === "CREDIT_CARD";
  const isCash = account.type === "CASH";
  const currentLimit = isCard ? (account.creditLimit ?? null) : (account.overdraftLimit ?? 0);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(account.name);
  const [institutionId, setInstitutionId] = useState(account.institutionId ?? NONE);
  const [limit, setLimit] = useState(currentLimit === null ? "" : String(currentLimit));
  const [closingDay, setClosingDay] = useState(String(account.closingDay ?? ""));
  const [dueDay, setDueDay] = useState(String(account.dueDay ?? ""));

  // See category-form-dialog.tsx for why this is needed and why it's a render-phase adjustment,
  // not an Effect: the dialog stays mounted across parent re-renders, so the useState
  // initializers above never see a fresher `account` prop (e.g. a field changed by a save
  // elsewhere that just triggered router.refresh()).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setName(account.name);
      setInstitutionId(account.institutionId ?? NONE);
      setLimit(currentLimit === null ? "" : String(currentLimit));
      setClosingDay(String(account.closingDay ?? ""));
      setDueDay(String(account.dueDay ?? ""));
      setError(null);
    }
  }

  function handleSubmit() {
    setError(null);

    if (name.trim() === "") {
      setError("Nome é obrigatório");
      return;
    }

    if (isCash) {
      startTransition(async () => {
        try {
          await updateAccountAction(account.id, { name: name.trim() });
          router.refresh();
          setOpen(false);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Erro ao salvar");
        }
      });
      return;
    }

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
      if (!Number.isInteger(closingDayValue) || closingDayValue < 1 || closingDayValue > 28) {
        setError("Dia de fechamento deve ser entre 1 e 28");
        return;
      }
      if (!Number.isInteger(dueDayValue) || dueDayValue < 1 || dueDayValue > 28) {
        setError("Dia de vencimento deve ser entre 1 e 28");
        return;
      }
    }

    startTransition(async () => {
      try {
        await updateAccountAction(account.id, {
          name: name.trim(),
          institutionId: institutionId === NONE ? null : institutionId,
          ...(isCard
            ? { creditLimit: value, closingDay: closingDayValue, dueDay: dueDayValue }
            : { overdraftLimit: value ?? 0 }),
        });
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
        <DialogTitle>{isCard ? "Editar Cartão" : "Editar Conta"}</DialogTitle>
        <DialogDescription>
          {isCard
            ? "Nome, instituição, limite, fechamento e vencimento da fatura — o banco pode alterar limite e datas a qualquer momento."
            : isCash
              ? "Nome da conta."
              : "Nome, instituição e limite de cheque especial da conta."}
        </DialogDescription>
        <Field>
          <Label>Nome da conta</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        {!isCash && (
          <Field>
            <Label>Instituição</Label>
            <Select value={institutionId} onValueChange={setInstitutionId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Nenhuma</SelectItem>
                {institutions.map((i) => (
                  <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        {!isCash && (
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
        )}
        {!isCash && currentLimit !== null && (
          <p className="text-xs opacity-70">Limite atual: <strong>{formatCurrency(currentLimit)}</strong></p>
        )}
        {isCard && (
          <div className="flex gap-3">
            <Field className="flex-1">
              <Label>Dia de fechamento</Label>
              <Input type="number" min="1" max="28" value={closingDay} onChange={(e) => setClosingDay(e.target.value)} />
            </Field>
            <Field className="flex-1">
              <Label>Dia de vencimento</Label>
              <Input type="number" min="1" max="28" value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
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
