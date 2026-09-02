"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, FieldError } from "@/components/ui/input";
import { CategorySelect } from "@/features/categories/components/category-select";
import { AccountSelect, AccountBalanceHint } from "@/components/ui/account-select";
import { Plus, Pencil } from "lucide-react";
import { createRecurringIncomeAction, updateRecurringIncomeAction } from "../actions";
import { recurringIncomeSchema } from "@/lib/validations/recurring-incomes";
import { monthKey, todayIso } from "@/lib/utils/date";
import type { AccountDTO, CategoryDTO, RecurringIncomeDTO } from "@/types/dto";

const NONE = "NONE";

export function RecurringIncomeFormDialog({
  categories: initialCategories,
  accounts,
  income,
}: {
  categories: CategoryDTO[];
  accounts: AccountDTO[];
  income?: RecurringIncomeDTO;
}) {
  const isEdit = !!income;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState(initialCategories);
  const [name, setName] = useState(income?.name ?? "");
  const [amount, setAmount] = useState(income ? String(income.plannedAmount) : "");
  const [dayOfMonth, setDayOfMonth] = useState(income ? String(income.dayOfMonth) : "5");
  const [categoryId, setCategoryId] = useState(income?.categoryId || NONE);
  const [defaultAccountId, setDefaultAccountId] = useState(income?.defaultAccountId ?? NONE);
  const [startCompetence, setStartCompetence] = useState(income?.startCompetence ?? monthKey(todayIso()));
  const [endCompetence, setEndCompetence] = useState(income?.endCompetence ?? "");

  // Render-phase re-sync from the `income` prop on open — same reasoning as fixed-expense-form-dialog.tsx.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setCategories(initialCategories);
      setName(income?.name ?? "");
      setAmount(income ? String(income.plannedAmount) : "");
      setDayOfMonth(income ? String(income.dayOfMonth) : "5");
      setCategoryId(income?.categoryId || NONE);
      setDefaultAccountId(income?.defaultAccountId ?? NONE);
      setStartCompetence(income?.startCompetence ?? monthKey(todayIso()));
      setEndCompetence(income?.endCompetence ?? "");
    }
  }

  function handleSubmit() {
    setError(null);
    const parsed = recurringIncomeSchema.safeParse({
      name,
      amount: Number(amount),
      dayOfMonth: Number(dayOfMonth),
      categoryId: categoryId === NONE ? undefined : categoryId,
      defaultAccountId: defaultAccountId === NONE ? undefined : defaultAccountId,
      startCompetence,
      endCompetence: endCompetence || undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    startTransition(async () => {
      try {
        if (isEdit) await updateRecurringIncomeAction({ id: income.id, ...parsed.data });
        else await createRecurringIncomeAction(parsed.data);
        router.refresh();
        setOpen(false);
        if (!isEdit) { setName(""); setAmount(""); }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao salvar receita recorrente");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <button className="p-1.5 -m-1.5 text-text/40 hover:text-accent" aria-label="Editar receita recorrente">
            <Pencil className="size-3.5" strokeWidth={1.5} />
          </button>
        ) : (
          <Button size="sm" variant="secondary"><Plus className="size-3.5" strokeWidth={1.5} /> Nova receita recorrente</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{isEdit ? "Editar receita recorrente" : "Nova receita recorrente"}</DialogTitle>
        <p className="text-xs opacity-70">
          Uma entrada previsível (salário, mesada, aluguel recebido). Não conta em nenhum gráfico até você registrar o recebimento de verdade — serve só pra não refazer o lançamento todo mês.
        </p>

        <Field>
          <Label>Nome</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Salário, Mesada..." />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field>
            <Label>Valor</Label>
            <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field>
            <Label>Dia do mês</Label>
            <Input type="number" min={1} max={28} value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field>
            <Label>Início</Label>
            <Input type="month" value={startCompetence} onChange={(e) => setStartCompetence(e.target.value)} />
          </Field>
          <Field>
            <Label>Fim (opcional)</Label>
            <Input type="month" min={startCompetence} value={endCompetence} onChange={(e) => setEndCompetence(e.target.value)} />
          </Field>
        </div>
        <Field>
          <Label>Categoria (opcional)</Label>
          <CategorySelect
            categories={categories}
            type="INCOME"
            value={categoryId}
            onChange={setCategoryId}
            onCategoryCreated={(created) => setCategories((prev) => [...prev, created])}
            noneValue={NONE}
            noneLabel="Sem categoria"
          />
        </Field>
        <Field>
          <Label>Conta padrão (opcional)</Label>
          <AccountSelect
            accounts={accounts.filter((a) => a.type !== "CREDIT_CARD")}
            value={defaultAccountId}
            onChange={setDefaultAccountId}
            noneValue={NONE}
            noneLabel="Nenhuma"
          />
          <AccountBalanceHint accounts={accounts} accountId={defaultAccountId} />
        </Field>
        <FieldError>{error}</FieldError>
        <DialogActions>
          <DialogClose asChild><Button variant="secondary" size="sm">Cancelar</Button></DialogClose>
          <Button size="sm" disabled={pending || !name || !amount} onClick={handleSubmit}>{pending ? "Salvando..." : "Salvar"}</Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
