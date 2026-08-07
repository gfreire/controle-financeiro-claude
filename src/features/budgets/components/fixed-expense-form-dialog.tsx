"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, FieldError } from "@/components/ui/input";
import { Plus, Pencil } from "lucide-react";
import { createFixedExpenseAction, updateFixedExpenseAction } from "../actions";
import { fixedExpenseSchema } from "@/lib/validations/fixed-expenses";
import type { AccountDTO, CategoryDTO, FixedExpenseDTO } from "@/types/dto";

const NONE = "NONE";

export function FixedExpenseFormDialog({
  categories,
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
  const [notices, setNotices] = useState<string[]>([]);
  const [name, setName] = useState(expense?.name ?? "");
  const [amount, setAmount] = useState(expense ? String(expense.plannedAmount) : "");
  const [dueDay, setDueDay] = useState(expense ? String(expense.dueDay) : "10");
  const [categoryId, setCategoryId] = useState(expense?.categoryId || NONE);
  const [subcategoryId, setSubcategoryId] = useState(expense?.subcategoryId ?? NONE);
  const [defaultAccountId, setDefaultAccountId] = useState(expense?.defaultAccountId ?? NONE);

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
        if (result.notices.length > 0) {
          setNotices(result.notices);
        } else {
          setOpen(false);
          if (!isEdit) { setName(""); setAmount(""); }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao salvar despesa fixa");
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
          <Button size="sm"><Plus className="size-3.5" strokeWidth={1.5} /> Nova despesa fixa</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{isEdit ? "Editar despesa fixa" : "Nova despesa fixa"}</DialogTitle>

        {notices.length > 0 ? (
          <>
            <DialogDescription>Despesa fixa salva. Como isso é um piso do orçamento da categoria/subcategoria, o sistema também ajustou:</DialogDescription>
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
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Aluguel, Netflix..." />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field>
                <Label>Valor</Label>
                <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              <Field>
                <Label>Dia de vencimento</Label>
                <Input type="number" min={1} max={31} value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
              </Field>
            </div>
            <Field>
              <Label>Categoria</Label>
              <Select value={categoryId} onValueChange={(v) => { setCategoryId(v); setSubcategoryId(NONE); }}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem categoria</SelectItem>
                  {expenseCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            {selectedCategory && selectedCategory.subcategories.length > 0 && (
              <Field>
                <Label>Subcategoria</Label>
                <Select value={subcategoryId} onValueChange={setSubcategoryId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sem subcategoria</SelectItem>
                    {selectedCategory.subcategories.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            )}
            <Field>
              <Label>Conta padrão (opcional)</Label>
              <Select value={defaultAccountId} onValueChange={setDefaultAccountId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Nenhuma</SelectItem>
                  {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <FieldError>{error}</FieldError>
            <DialogActions>
              <DialogClose asChild><Button variant="secondary" size="sm">Cancelar</Button></DialogClose>
              <Button size="sm" disabled={pending || !name || !amount} onClick={handleSubmit}>{pending ? "Salvando..." : "Salvar"}</Button>
            </DialogActions>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
