"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, FieldError } from "@/components/ui/input";
import { CategorySelect } from "@/features/categories/components/category-select";
import { Plus } from "lucide-react";
import { createDebtAction, updateDebtAction } from "../actions";
import { debtSchema, updateDebtSchema } from "@/lib/validations/debts";
import type { CategoryDTO, DebtDTO } from "@/types/dto";
import type { DebtKind } from "@/types/database";

const NONE = "NONE";

const KIND_LABELS: Record<DebtKind, string> = {
  PERSONAL: "Pessoal (amigo/família)",
  OVERDUE_BILL: "Conta em atraso",
  INSTALLMENT_PLAN: "Parcelamento programado",
};

export function DebtFormDialog({
  categories: initialCategories,
  debt,
  trigger,
}: {
  categories: CategoryDTO[];
  /** Present → edit mode: prefills from this debt and saves via updateDebtAction. */
  debt?: DebtDTO;
  trigger?: React.ReactNode;
}) {
  const isEdit = !!debt;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState(initialCategories);
  const [agent, setAgent] = useState(debt?.agent ?? "");
  const [kind, setKind] = useState<DebtKind>(debt?.kind ?? "PERSONAL");
  const [side, setSide] = useState<"PAYABLE" | "RECEIVABLE">(debt?.side ?? "PAYABLE");
  const [initialBalance, setInitialBalance] = useState(debt?.originalAmount !== undefined ? String(debt.originalAmount) : "");
  const [defaultCategoryId, setDefaultCategoryId] = useState(debt?.defaultCategoryId ?? NONE);
  const [monthlyAmount, setMonthlyAmount] = useState(debt?.monthlyAmount !== undefined ? String(debt.monthlyAmount) : "");
  const [dueDay, setDueDay] = useState(debt?.dueDay !== undefined ? String(debt.dueDay) : "10");

  // See category-form-dialog.tsx for why this is needed and why it's a render-phase adjustment,
  // not an Effect: the dialog stays mounted across parent re-renders, so the useState
  // initializers above never see a fresher `debt` prop on their own.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setCategories(initialCategories);
      setAgent(debt?.agent ?? "");
      setKind(debt?.kind ?? "PERSONAL");
      setSide(debt?.side ?? "PAYABLE");
      setInitialBalance(debt?.originalAmount !== undefined ? String(debt.originalAmount) : "");
      setDefaultCategoryId(debt?.defaultCategoryId ?? NONE);
      setMonthlyAmount(debt?.monthlyAmount !== undefined ? String(debt.monthlyAmount) : "");
      setDueDay(debt?.dueDay !== undefined ? String(debt.dueDay) : "10");
    }
  }

  // Conta em atraso e parcelamento combinado só existem como algo que se deve — só uma dívida
  // pessoal pode ir em qualquer direção (emprestar ou pegar emprestado).
  const isLockedToPayable = kind !== "PERSONAL";
  const effectiveSide = isLockedToPayable ? "PAYABLE" : side;
  const isInstallmentPlan = kind === "INSTALLMENT_PLAN";

  // A debt's default category is used when its *payment* is registered — for PAYABLE that's
  // always an EXPENSE (paying off what's owed), for RECEIVABLE always an INCOME (money coming
  // in), see debts.service.ts#addDebtTransaction.
  const categoryType = effectiveSide === "PAYABLE" ? "EXPENSE" : "INCOME";

  function handleSubmit() {
    setError(null);
    const payload = {
      agent,
      side: effectiveSide,
      kind,
      initialBalance: Number(initialBalance),
      defaultCategoryId: defaultCategoryId === NONE ? null : defaultCategoryId,
      monthlyAmount: isInstallmentPlan ? Number(monthlyAmount) : null,
      dueDay: isInstallmentPlan ? Number(dueDay) : null,
    };
    if (isEdit) {
      const parsed = updateDebtSchema.safeParse({ id: debt!.id, ...payload });
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "Dados inválidos");
        return;
      }
      startTransition(async () => {
        try {
          await updateDebtAction(parsed.data);
          router.refresh();
          setOpen(false);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Erro ao editar dívida");
        }
      });
      return;
    }

    const parsed = debtSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    startTransition(async () => {
      try {
        await createDebtAction(parsed.data);
        router.refresh();
        setOpen(false);
        setAgent(""); setInitialBalance(""); setDefaultCategoryId(NONE); setMonthlyAmount(""); setDueDay("10");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao criar dívida");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button size="sm"><Plus className="size-3.5" strokeWidth={1.5} /> Nova dívida</Button>}
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{isEdit ? "Editar dívida" : "Nova dívida"}</DialogTitle>
        <Field>
          <Label>Tipo de dívida</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as DebtKind)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(KIND_LABELS) as DebtKind[]).map((k) => (
                <SelectItem key={k} value={k}>{KIND_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isLockedToPayable && (
            <p className="mt-1 text-[11px] opacity-50">Sempre &quot;a pagar&quot; — não existe conta em atraso ou parcelamento a receber.</p>
          )}
        </Field>
        {!isLockedToPayable && (
          <Field>
            <Label>Direção</Label>
            <Select value={side} onValueChange={(v) => { setSide(v as typeof side); setDefaultCategoryId(NONE); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PAYABLE">Devo (a pagar)</SelectItem>
                <SelectItem value="RECEIVABLE">Me devem (a receber)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        )}
        <Field>
          <Label>{effectiveSide === "PAYABLE" ? "Para quem devo" : "Quem me deve"}</Label>
          <Input value={agent} onChange={(e) => setAgent(e.target.value)} placeholder={kind === "OVERDUE_BILL" ? "Ex: Conta de luz, Aluguel..." : undefined} />
        </Field>
        <Field>
          <Label>Valor inicial</Label>
          <Input type="number" step="0.01" value={initialBalance} onChange={(e) => setInitialBalance(e.target.value)} />
        </Field>
        {isInstallmentPlan && (
          <div className="grid grid-cols-2 gap-2">
            <Field>
              <Label>Valor mensal combinado</Label>
              <Input type="number" step="0.01" min="0.01" value={monthlyAmount} onChange={(e) => setMonthlyAmount(e.target.value)} />
            </Field>
            <Field>
              <Label>Dia de vencimento</Label>
              <Input type="number" min={1} max={28} value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
            </Field>
          </div>
        )}
        <Field>
          <Label>Categoria padrão (ao pagar)</Label>
          <CategorySelect
            categories={categories}
            type={categoryType}
            value={defaultCategoryId}
            onChange={setDefaultCategoryId}
            onCategoryCreated={(created) => setCategories((prev) => [...prev, created])}
            noneValue={NONE}
            noneLabel="Nenhuma"
          />
        </Field>
        <FieldError>{error}</FieldError>
        <DialogActions>
          <DialogClose asChild><Button variant="secondary" size="sm">Cancelar</Button></DialogClose>
          <Button size="sm" disabled={pending || !agent || !initialBalance} onClick={handleSubmit}>{pending ? "Salvando..." : "Salvar"}</Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
