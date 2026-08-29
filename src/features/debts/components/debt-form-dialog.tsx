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
import { monthKey, todayIso } from "@/lib/utils/date";
import type { CategoryDTO, DebtDTO } from "@/types/dto";
import type { DebtKind } from "@/types/database";

const NONE = "NONE";

// Since 2026-08-29 each `debts.kind` has its own screen (see nav-items.ts), so the form no
// longer offers a kind picker — the kind is fixed by whichever screen opened the dialog (create)
// or by the debt itself (edit). The copy below is what differs per kind.
const KIND_COPY: Record<DebtKind, { newTitle: string; editTitle: string; newButton: string; agentLabelPayable: string; agentLabelReceivable: string; agentPlaceholder?: string }> = {
  PERSONAL: {
    newTitle: "Nova dívida pessoal",
    editTitle: "Editar dívida pessoal",
    newButton: "Nova dívida",
    agentLabelPayable: "Para quem devo",
    agentLabelReceivable: "Quem me deve",
  },
  OVERDUE_BILL: {
    newTitle: "Nova conta em atraso",
    editTitle: "Editar conta em atraso",
    newButton: "Nova conta em atraso",
    agentLabelPayable: "Conta",
    agentLabelReceivable: "Conta",
    agentPlaceholder: "Ex: Conta de luz, Aluguel...",
  },
  INSTALLMENT_PLAN: {
    newTitle: "Novo parcelamento programado",
    editTitle: "Editar parcelamento programado",
    newButton: "Novo parcelamento",
    agentLabelPayable: "Para quem devo",
    agentLabelReceivable: "Para quem devo",
    agentPlaceholder: "Ex: Loja X, Financiamento...",
  },
};

export function DebtFormDialog({
  categories: initialCategories,
  kind: fixedKind = "PERSONAL",
  debt,
  trigger,
}: {
  categories: CategoryDTO[];
  /** Fixed kind for create mode — set by the screen this dialog lives on. Ignored in edit mode. */
  kind?: DebtKind;
  /** Present → edit mode: prefills from this debt and saves via updateDebtAction. */
  debt?: DebtDTO;
  trigger?: React.ReactNode;
}) {
  const isEdit = !!debt;
  const kind: DebtKind = debt?.kind ?? fixedKind;
  const copy = KIND_COPY[kind];
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState(initialCategories);
  const [agent, setAgent] = useState(debt?.agent ?? "");
  const [side, setSide] = useState<"PAYABLE" | "RECEIVABLE">(debt?.side ?? "PAYABLE");
  const [initialBalance, setInitialBalance] = useState(debt?.originalAmount !== undefined ? String(debt.originalAmount) : "");
  const [defaultCategoryId, setDefaultCategoryId] = useState(debt?.defaultCategoryId ?? NONE);
  const [monthlyAmount, setMonthlyAmount] = useState(debt?.monthlyAmount !== undefined ? String(debt.monthlyAmount) : "");
  const [dueDay, setDueDay] = useState(debt?.dueDay !== undefined ? String(debt.dueDay) : "10");
  const [startCompetence, setStartCompetence] = useState(debt?.startCompetence ?? monthKey(todayIso()));

  // See category-form-dialog.tsx for why this is needed and why it's a render-phase adjustment,
  // not an Effect: the dialog stays mounted across parent re-renders, so the useState
  // initializers above never see a fresher `debt` prop on their own.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setCategories(initialCategories);
      setAgent(debt?.agent ?? "");
      setSide(debt?.side ?? "PAYABLE");
      setInitialBalance(debt?.originalAmount !== undefined ? String(debt.originalAmount) : "");
      setDefaultCategoryId(debt?.defaultCategoryId ?? NONE);
      setMonthlyAmount(debt?.monthlyAmount !== undefined ? String(debt.monthlyAmount) : "");
      setDueDay(debt?.dueDay !== undefined ? String(debt.dueDay) : "10");
      setStartCompetence(debt?.startCompetence ?? monthKey(todayIso()));
    }
  }

  // Conta em atraso e parcelamento programado só existem como algo que se deve — só uma dívida
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
      startCompetence: isInstallmentPlan ? startCompetence : null,
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
        setAgent(""); setInitialBalance(""); setDefaultCategoryId(NONE); setMonthlyAmount(""); setDueDay("10"); setStartCompetence(monthKey(todayIso()));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao criar dívida");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button size="sm"><Plus className="size-3.5" strokeWidth={1.5} /> {copy.newButton}</Button>}
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{isEdit ? copy.editTitle : copy.newTitle}</DialogTitle>
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
          <Label>{effectiveSide === "PAYABLE" ? copy.agentLabelPayable : copy.agentLabelReceivable}</Label>
          <Input value={agent} onChange={(e) => setAgent(e.target.value)} placeholder={copy.agentPlaceholder} />
        </Field>
        <Field>
          <Label>Valor inicial</Label>
          <Input type="number" step="0.01" value={initialBalance} onChange={(e) => setInitialBalance(e.target.value)} />
        </Field>
        {isInstallmentPlan && (
          <>
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
            <Field>
              <Label>Mês de competência inicial</Label>
              <Input type="month" value={startCompetence} onChange={(e) => setStartCompetence(e.target.value)} />
              <p className="mt-1 text-[11px] opacity-50">A partir de quando este parcelamento passa a contar — usado pra saber se está adiantado ou atrasado.</p>
            </Field>
          </>
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
