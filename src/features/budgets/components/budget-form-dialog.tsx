"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, FieldError } from "@/components/ui/input";
import { Plus } from "lucide-react";
import { createBudgetAction } from "../actions";
import { budgetSchema } from "@/lib/validations/budgets";
import type { CategoryDTO } from "@/types/dto";

const NONE = "NONE";

export function BudgetFormDialog({ categories }: { categories: CategoryDTO[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState(NONE);
  const [amount, setAmount] = useState("");

  const expenseCategories = categories.filter((c) => c.type === "EXPENSE");
  const selectedCategory = expenseCategories.find((c) => c.id === categoryId);

  function handleSubmit() {
    setError(null);
    const parsed = budgetSchema.safeParse({ categoryId, subcategoryId: subcategoryId === NONE ? undefined : subcategoryId, amount: Number(amount) });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    startTransition(async () => {
      try {
        await createBudgetAction(parsed.data);
        router.refresh();
        setOpen(false);
        setAmount("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao criar orçamento");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="size-3.5" strokeWidth={1.5} /> Novo orçamento</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Novo orçamento</DialogTitle>
        <Field>
          <Label>Categoria</Label>
          <Select value={categoryId} onValueChange={(v) => { setCategoryId(v); setSubcategoryId(NONE); }}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {expenseCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        {selectedCategory && selectedCategory.subcategories.length > 0 && (
          <Field>
            <Label>Subcategoria (opcional)</Label>
            <Select value={subcategoryId} onValueChange={setSubcategoryId}>
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
      </DialogContent>
    </Dialog>
  );
}
