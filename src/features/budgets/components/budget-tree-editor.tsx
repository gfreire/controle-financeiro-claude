"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ListTree } from "lucide-react";
import { createBudgetAction, updateBudgetAction, deactivateBudgetAction } from "../actions";
import { BudgetTreeFields, rowKey, type RowKey } from "./budget-tree-fields";
import { formatCurrency } from "@/lib/utils/currency";
import type { BudgetDTO, CategoryDTO, FixedExpenseDTO } from "@/types/dto";

/**
 * Tree-based budget planning screen — reuses the onboarding category-tree visual pattern
 * (category row + nested subcategory rows) but with an amount input per row instead of a
 * checkbox, so a whole category/subcategory tree can be planned in one place (e.g.
 * "Alimentação: 1200, ↳ Restaurante: 600, ↳ Delivery: 400") instead of one dialog per row.
 * See AI_CONTEXT.md "Budgets" — saving still goes through the same
 * createBudgetAction/updateBudgetAction floor validation as the single-row dialog, scoped to
 * `month`. Category rows save before subcategory rows in the loop below — this ordering matters:
 * it's what lets a category's ceiling exist before its children are checked against it in the
 * same submission. Also doubles as a bulk-delete tool: clearing a row that already has a budget
 * deactivates it (deactivateBudgetAction), same floor/fixed-expense guards as the single-row
 * delete button apply — so this fails gracefully (an error, not a crash) when a row still has
 * fixed expenses depending on it.
 */
export function BudgetTreeEditor({
  categories,
  budgets,
  fixedExpenses,
  month,
}: {
  categories: CategoryDTO[];
  budgets: BudgetDTO[];
  fixedExpenses: FixedExpenseDTO[];
  month: string;
}) {
  const expenseCategories = categories.filter((c) => c.type === "EXPENSE");
  const budgetByKey = new Map<RowKey, BudgetDTO>();
  for (const b of budgets) budgetByKey.set(rowKey(b.categoryId, b.subcategoryId), b);

  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [amounts, setAmounts] = useState<Record<RowKey, string>>(() => {
    const initial: Record<RowKey, string> = {};
    for (const [key, b] of budgetByKey) initial[key] = String(b.plannedAmount);
    return initial;
  });
  const [notices, setNotices] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  function setAmount(key: RowKey, value: string) {
    setAmounts((prev) => ({ ...prev, [key]: value }));
  }

  // Mirrors BudgetTreeFields' own floor math so a save attempt below the floor fails fast,
  // client-side, instead of only after the server round trip — the server check stays the
  // real source of truth either way.
  function floorFor(categoryId: string, subcategoryId: string | undefined): number {
    if (subcategoryId) {
      return fixedExpenses.filter((f) => f.subcategoryId === subcategoryId).reduce((sum, f) => sum + f.plannedAmount, 0);
    }
    const category = expenseCategories.find((c) => c.id === categoryId);
    const subSum = (category?.subcategories ?? []).reduce((sum, s) => sum + (Number(amounts[rowKey(categoryId, s.id)]) || 0), 0);
    const directFixed = fixedExpenses.filter((f) => f.categoryId === categoryId && !f.subcategoryId).reduce((sum, f) => sum + f.plannedAmount, 0);
    return subSum + directFixed;
  }

  function handleSave() {
    setNotices([]);
    setErrors([]);
    startTransition(async () => {
      const allNotices: string[] = [];
      const allErrors: string[] = [];

      async function saveRow(categoryId: string, subcategoryId: string | undefined, label: string) {
        const key = rowKey(categoryId, subcategoryId);
        const raw = amounts[key];
        const existing = budgetByKey.get(key);

        // Blank field on a row that already has a budget = delete it — this dialog mirrors the
        // whole tree, so clearing what used to be a value is how the user removes it in bulk,
        // instead of hunting down the matching trash icon in the read view.
        if (raw === undefined || raw.trim() === "") {
          if (existing) {
            try {
              await deactivateBudgetAction(existing.id);
            } catch (e) {
              allErrors.push(`${label}: ${e instanceof Error ? e.message : "erro ao excluir"}`);
            }
          }
          return;
        }

        const amount = Number(raw);
        if (!Number.isFinite(amount) || amount <= 0) return;
        if (existing && existing.plannedAmount === amount) return; // unchanged, nothing to do

        const floor = floorFor(categoryId, subcategoryId);
        if (amount < floor) {
          allErrors.push(`${label}: valor não pode ser menor que ${formatCurrency(floor)}`);
          return;
        }

        try {
          const result = existing
            ? await updateBudgetAction({ id: existing.id, amount })
            : await createBudgetAction({ categoryId, subcategoryId, amount, month });
          allNotices.push(...result.notices);
        } catch (e) {
          allErrors.push(`${label}: ${e instanceof Error ? e.message : "erro ao salvar"}`);
        }
      }

      for (const category of expenseCategories) {
        await saveRow(category.id, undefined, category.name);
        for (const sub of category.subcategories) {
          await saveRow(category.id, sub.id, `${category.name} · ${sub.name}`);
        }
      }

      router.refresh();
      setNotices(allNotices);
      setErrors(allErrors);
      if (allErrors.length === 0 && allNotices.length === 0) setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary"><ListTree className="size-3.5" strokeWidth={1.5} /> Planejar orçamentos</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogTitle>Planejar orçamentos</DialogTitle>
        <DialogDescription>
          Defina o valor de cada categoria e, se quiser, reparta entre subcategorias — o que sobrar fica livre dentro da categoria. Deixe em branco o que não quiser planejar agora, ou apague o valor de um orçamento já existente para removê-lo.
        </DialogDescription>

        <BudgetTreeFields categories={categories} amounts={amounts} onChange={setAmount} fixedExpenses={fixedExpenses} />

        {errors.length > 0 && (
          <div className="flex flex-col gap-1 text-sm text-danger-600">
            {errors.map((e, i) => <p key={i}>• {e}</p>)}
          </div>
        )}
        {notices.length > 0 && (
          <div className="flex flex-col gap-1 text-sm text-accent">
            {notices.map((n, i) => <p key={i}>• {n}</p>)}
          </div>
        )}

        <DialogActions>
          {notices.length > 0 || errors.length > 0 ? (
            <Button size="sm" onClick={() => setOpen(false)}>Ok</Button>
          ) : (
            <>
              <DialogClose asChild><Button variant="secondary" size="sm">Cancelar</Button></DialogClose>
              <Button size="sm" disabled={pending} onClick={handleSave}>{pending ? "Salvando..." : "Salvar tudo"}</Button>
            </>
          )}
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
