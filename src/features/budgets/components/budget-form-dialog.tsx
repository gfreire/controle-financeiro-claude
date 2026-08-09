"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, FieldError } from "@/components/ui/input";
import { CategorySelect, SubcategorySelect } from "@/features/categories/components/category-select";
import { Plus, Pencil } from "lucide-react";
import { createBudgetAction, updateBudgetAction, getBudgetFloorAction } from "../actions";
import { budgetSchema } from "@/lib/validations/budgets";
import { formatCurrency } from "@/lib/utils/currency";
import type { BudgetDTO, CategoryDTO } from "@/types/dto";

const NONE = "NONE";

type EditableBudget = Pick<BudgetDTO, "id" | "categoryId" | "subcategoryId" | "plannedAmount">;

export function BudgetFormDialog({ categories: initialCategories, budget, month }: { categories: CategoryDTO[]; budget?: EditableBudget; month: string }) {
  const isEdit = !!budget;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const [categories, setCategories] = useState(initialCategories);
  const [categoryId, setCategoryId] = useState(budget?.categoryId ?? "");
  const [subcategoryId, setSubcategoryId] = useState(budget?.subcategoryId ?? NONE);
  const [amount, setAmount] = useState(budget ? String(budget.plannedAmount) : "");
  const [fetchedFloor, setFetchedFloor] = useState(0);

  const expenseCategories = categories.filter((c) => c.type === "EXPENSE");
  const selectedCategory = expenseCategories.find((c) => c.id === categoryId);
  const floor = categoryId ? fetchedFloor : 0;

  // Mirrors the server-side floor (AI_CONTEXT.md "Budget hierarchy") so the input rejects a
  // too-low value up front instead of only after a round trip — the server check stays the
  // real source of truth either way.
  useEffect(() => {
    if (!open || !categoryId) return;
    let cancelled = false;
    getBudgetFloorAction(categoryId, subcategoryId === NONE ? undefined : subcategoryId, month).then((f) => {
      if (!cancelled) setFetchedFloor(f);
    });
    return () => { cancelled = true; };
  }, [open, categoryId, subcategoryId, month]);

  function handleSubmit() {
    setError(null);
    if (Number(amount) < floor) {
      setError(`O orçamento não pode ser menor que ${formatCurrency(floor)}.`);
      return;
    }
    const parsed = budgetSchema.safeParse({ categoryId, subcategoryId: subcategoryId === NONE ? undefined : subcategoryId, amount: Number(amount), month });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    startTransition(async () => {
      try {
        const result = isEdit ? await updateBudgetAction({ id: budget.id, ...parsed.data }) : await createBudgetAction(parsed.data);
        router.refresh();
        if (result.notices.length > 0) {
          setNotices(result.notices);
        } else {
          setOpen(false);
          if (!isEdit) setAmount("");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao salvar orçamento");
      }
    });
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setNotices([]);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {isEdit ? (
          <button className="text-text/40 hover:text-accent"><Pencil className="size-3.5" strokeWidth={1.5} /></button>
        ) : (
          <Button size="sm"><Plus className="size-3.5" strokeWidth={1.5} /> Novo orçamento</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{isEdit ? "Editar orçamento" : "Novo orçamento"}</DialogTitle>

        {notices.length > 0 ? (
          <>
            <DialogDescription>Orçamento salvo. Como o valor comprometido em despesas fixas/subcategorias mudou, o sistema também ajustou:</DialogDescription>
            <ul className="flex flex-col gap-1 text-sm text-accent">
              {notices.map((n, i) => <li key={i}>• {n}</li>)}
            </ul>
            <DialogActions>
              <Button size="sm" onClick={() => handleOpenChange(false)}>Ok</Button>
            </DialogActions>
          </>
        ) : (
          <>
            <Field>
              <Label>Categoria</Label>
              <CategorySelect
                categories={categories}
                type="EXPENSE"
                value={categoryId}
                onChange={(v) => { setCategoryId(v); setSubcategoryId(NONE); }}
                onCategoryCreated={(created) => setCategories((prev) => [...prev, created])}
                disabled={isEdit}
              />
            </Field>
            {selectedCategory && (
              <Field>
                <Label>Subcategoria (opcional)</Label>
                <SubcategorySelect
                  subcategories={selectedCategory.subcategories}
                  categoryId={selectedCategory.id}
                  value={subcategoryId}
                  onChange={setSubcategoryId}
                  onSubcategoryCreated={(created) =>
                    setCategories((prev) => prev.map((c) => (c.id === selectedCategory.id ? { ...c, subcategories: [...c.subcategories, created] } : c)))
                  }
                  noneValue={NONE}
                  noneLabel="Categoria inteira"
                  disabled={isEdit}
                />
              </Field>
            )}
            <Field>
              <Label>Valor planejado / mês</Label>
              <Input type="number" step="0.01" min={floor > 0 ? floor : "0.01"} value={amount} onChange={(e) => setAmount(e.target.value)} />
              {floor > 0 && <p className="mt-1 text-[11px] opacity-60">Mínimo: {formatCurrency(floor)} (já comprometido em despesas fixas/subcategorias)</p>}
            </Field>
            <FieldError>{error}</FieldError>
            <DialogActions>
              <DialogClose asChild><Button variant="secondary" size="sm">Cancelar</Button></DialogClose>
              <Button size="sm" disabled={pending || !categoryId || !amount} onClick={handleSubmit}>{pending ? "Salvando..." : "Salvar"}</Button>
            </DialogActions>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
