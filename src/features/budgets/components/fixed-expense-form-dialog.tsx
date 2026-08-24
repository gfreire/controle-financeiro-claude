"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, FieldError } from "@/components/ui/input";
import { CategorySelect, SubcategorySelect } from "@/features/categories/components/category-select";
import { AccountSelect } from "@/components/ui/account-select";
import { Plus, Pencil } from "lucide-react";
import { createFixedExpenseAction, updateFixedExpenseAction } from "../actions";
import { fixedExpenseSchema } from "@/lib/validations/fixed-expenses";
import { formatMonthLabel, todayIso } from "@/lib/utils/date";
import type { AccountDTO, CategoryDTO, FixedExpenseDTO } from "@/types/dto";

const NONE = "NONE";

export function FixedExpenseFormDialog({
  categories: initialCategories,
  accounts,
  expense,
}: {
  categories: CategoryDTO[];
  accounts: AccountDTO[];
  expense?: FixedExpenseDTO;
}) {
  const isEdit = !!expense;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Notices (e.g. "Alimentação foi ajustada para 800,00") render as a self-dismissing inline
  // banner next to the trigger, not a screen that replaces the form and forces a second click to
  // close — the dialog itself already closed by the time these show (2026-08-23, at the user's
  // request: informational-only notices shouldn't block the flow the way the over-limit/quitação
  // confirmations correctly do).
  const [lastNotices, setLastNotices] = useState<string[]>([]);
  const [categories, setCategories] = useState(initialCategories);
  const [name, setName] = useState(expense?.name ?? "");
  const [amount, setAmount] = useState(expense ? String(expense.plannedAmount) : "");
  const [dueDay, setDueDay] = useState(expense ? String(expense.dueDay) : "10");
  const [categoryId, setCategoryId] = useState(expense?.categoryId || NONE);
  const [subcategoryId, setSubcategoryId] = useState(expense?.subcategoryId ?? NONE);
  const [defaultAccountId, setDefaultAccountId] = useState(expense?.defaultAccountId ?? NONE);

  // See category-form-dialog.tsx for why this is needed and why it's a render-phase adjustment,
  // not an Effect: the dialog stays mounted across parent re-renders, so the useState
  // initializers above never see a fresher `expense` prop on their own.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setCategories(initialCategories);
      setName(expense?.name ?? "");
      setAmount(expense ? String(expense.plannedAmount) : "");
      setDueDay(expense ? String(expense.dueDay) : "10");
      setCategoryId(expense?.categoryId || NONE);
      setSubcategoryId(expense?.subcategoryId ?? NONE);
      setDefaultAccountId(expense?.defaultAccountId ?? NONE);
    }
  }

  const expenseCategories = categories.filter((c) => c.type === "EXPENSE");
  const selectedCategory = expenseCategories.find((c) => c.id === categoryId);

  function handleSubmit() {
    setError(null);
    const parsed = fixedExpenseSchema.safeParse({
      name,
      amount: Number(amount),
      dueDay: Number(dueDay),
      categoryId: categoryId === NONE ? undefined : categoryId,
      subcategoryId: subcategoryId === NONE ? undefined : subcategoryId,
      defaultAccountId: defaultAccountId === NONE ? undefined : defaultAccountId,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    startTransition(async () => {
      try {
        const result = isEdit ? await updateFixedExpenseAction({ id: expense.id, ...parsed.data }) : await createFixedExpenseAction(parsed.data);
        router.refresh();
        setOpen(false);
        if (!isEdit) { setName(""); setAmount(""); }
        if (result.notices.length > 0) setLastNotices(result.notices);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao salvar despesa fixa");
      }
    });
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
  }

  // Self-dismiss after a few seconds — it's informational, not a decision the user has to act on.
  useEffect(() => {
    if (lastNotices.length === 0) return;
    const timer = setTimeout(() => setLastNotices([]), 8000);
    return () => clearTimeout(timer);
  }, [lastNotices]);

  return (
    <div className="relative inline-flex">
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          {isEdit ? (
            <button className="p-1.5 -m-1.5 text-text/40 hover:text-accent" aria-label="Editar despesa fixa">
              <Pencil className="size-3.5" strokeWidth={1.5} />
            </button>
          ) : (
            <Button size="sm"><Plus className="size-3.5" strokeWidth={1.5} /> Nova despesa fixa</Button>
          )}
        </DialogTrigger>
        <DialogContent>
          <DialogTitle>{isEdit ? "Editar despesa fixa" : "Nova despesa fixa"}</DialogTitle>

          <Field>
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Aluguel, Netflix..." />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field>
              <Label>Valor</Label>
              <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              {isEdit && (
                <p className="mt-1 text-[11px] opacity-50">Vale a partir de {formatMonthLabel(todayIso())} — meses anteriores mantêm o valor de antes.</p>
              )}
            </Field>
            <Field>
              <Label>Dia de vencimento</Label>
              <Input type="number" min={1} max={31} value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
            </Field>
          </div>
          <Field>
            <Label>Categoria</Label>
            <CategorySelect
              categories={categories}
              type="EXPENSE"
              value={categoryId}
              onChange={(v) => { setCategoryId(v); setSubcategoryId(NONE); }}
              onCategoryCreated={(created) => setCategories((prev) => [...prev, created])}
              noneValue={NONE}
              noneLabel="Sem categoria"
            />
          </Field>
          {selectedCategory && (
            <Field>
              <Label>Subcategoria</Label>
              <SubcategorySelect
                subcategories={selectedCategory.subcategories}
                categoryId={selectedCategory.id}
                value={subcategoryId}
                onChange={setSubcategoryId}
                onSubcategoryCreated={(created) =>
                  setCategories((prev) => prev.map((c) => (c.id === selectedCategory.id ? { ...c, subcategories: [...c.subcategories, created] } : c)))
                }
                noneValue={NONE}
                noneLabel="Sem subcategoria"
              />
            </Field>
          )}
          <Field>
            <Label>Conta padrão (opcional)</Label>
            <AccountSelect
              accounts={accounts}
              value={defaultAccountId}
              onChange={setDefaultAccountId}
              noneValue={NONE}
              noneLabel="Nenhuma"
            />
            <p className="mt-1 text-[11px] opacity-50">Se for uma conta de cartão de crédito, o pagamento é lançado como uma compra de 1x, na competência da fatura.</p>
          </Field>
          <FieldError>{error}</FieldError>
          <DialogActions>
            <DialogClose asChild><Button variant="secondary" size="sm">Cancelar</Button></DialogClose>
            <Button size="sm" disabled={pending || !name || !amount} onClick={handleSubmit}>{pending ? "Salvando..." : "Salvar"}</Button>
          </DialogActions>
        </DialogContent>
      </Dialog>

      {lastNotices.length > 0 && (
        <div className="absolute top-full left-0 z-20 mt-1.5 flex w-72 flex-col gap-1.5 border border-accent bg-surface p-2.5 text-xs shadow-md">
          <div className="flex items-start justify-between gap-2">
            <p className="opacity-70">Despesa fixa salva. O sistema também ajustou:</p>
            <button type="button" onClick={() => setLastNotices([])} aria-label="Dispensar aviso" className="shrink-0 opacity-50 hover:opacity-100">
              <X className="size-3.5" strokeWidth={1.5} />
            </button>
          </div>
          <ul className="flex flex-col gap-1 text-accent">
            {lastNotices.map((n, i) => <li key={i}>• {n}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
