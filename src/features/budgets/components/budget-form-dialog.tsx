"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, FieldError } from "@/components/ui/input";
import { Plus, Pencil } from "lucide-react";
import { createBudgetAction, updateBudgetAction } from "../actions";
import { budgetSchema } from "@/lib/validations/budgets";
import type { BudgetDTO, CategoryDTO } from "@/types/dto";

const NONE = "NONE";

type EditableBudget = Pick<BudgetDTO, "id" | "categoryId" | "subcategoryId" | "plannedAmount">;

export function BudgetFormDialog({ categories, budget, month }: { categories: CategoryDTO[]; budget?: EditableBudget; month: string }) {
  const isEdit = !!budget;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const [categoryId, setCategoryId] = useState(budget?.categoryId ?? "");
  const [subcategoryId, setSubcategoryId] = useState(budget?.subcategoryId ?? NONE);
  const [amount, setAmount] = useState(budget ? String(budget.plannedAmount) : "");

  const expenseCategories = categories.filter((c) => c.type === "EXPENSE");
  const selectedCategory = expenseCategories.find((c) => c.id === categoryId);

  function handleSubmit() {
    setError(null);
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
              <Select value={categoryId} onValueChange={(v) => { setCategoryId(v); setSubcategoryId(NONE); }} disabled={isEdit}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {expenseCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            {selectedCategory && selectedCategory.subcategories.length > 0 && (
              <Field>
                <Label>Subcategoria (opcional)</Label>
                <Select value={subcategoryId} onValueChange={setSubcategoryId} disabled={isEdit}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Categoria inteira</SelectItem>
                    {selectedCategory.subcategories.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            )}
            <Field>
              <Label>Valor planejado / mês</Label>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
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
