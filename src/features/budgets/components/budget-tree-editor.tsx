"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListTree } from "lucide-react";
import { createBudgetAction, updateBudgetAction } from "../actions";
import type { BudgetDTO, CategoryDTO } from "@/types/dto";

type RowKey = string; // `${categoryId}` for category-level, `${categoryId}:${subcategoryId}` for subcategory-level

function rowKey(categoryId: string, subcategoryId?: string) {
  return subcategoryId ? `${categoryId}:${subcategoryId}` : categoryId;
}

/**
 * Tree-based budget planning screen — reuses the onboarding category-tree visual pattern
 * (category row + nested subcategory rows) but with an amount input per row instead of a
 * checkbox, so a whole category/subcategory tree can be planned in one place (e.g.
 * "Alimentação: 1200, ↳ Restaurante: 600, ↳ Delivery: 400") instead of one dialog per row.
 * See AI_CONTEXT.md "Budget hierarchy" — saving still goes through the same
 * createBudgetAction/updateBudgetAction floor validation as the single-row dialog.
 */
export function BudgetTreeEditor({ categories, budgets }: { categories: CategoryDTO[]; budgets: BudgetDTO[] }) {
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

  function handleSave() {
    setNotices([]);
    setErrors([]);
    startTransition(async () => {
      const allNotices: string[] = [];
      const allErrors: string[] = [];

      async function saveRow(categoryId: string, subcategoryId: string | undefined, label: string) {
        const key = rowKey(categoryId, subcategoryId);
        const raw = amounts[key];
        if (raw === undefined || raw.trim() === "") return;
        const amount = Number(raw);
        if (!Number.isFinite(amount) || amount <= 0) return;

        const existing = budgetByKey.get(key);
        if (existing && existing.plannedAmount === amount) return; // unchanged, nothing to do

        try {
          const result = existing
            ? await updateBudgetAction({ id: existing.id, amount })
            : await createBudgetAction({ categoryId, subcategoryId, amount });
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
          Defina o valor de cada categoria e, se quiser, reparta entre subcategorias — o que sobrar fica livre dentro da categoria. Deixe em branco o que não quiser planejar agora.
        </DialogDescription>

        <div className="flex flex-col gap-2">
          {expenseCategories.map((category) => (
            <div key={category.id} className="border border-divider">
              <div className="flex items-center gap-2 px-2.5 py-2 text-sm font-medium">
                <span className="flex-1">{category.icon} {category.name}</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  className="h-7 w-28 text-xs"
                  placeholder="—"
                  value={amounts[rowKey(category.id)] ?? ""}
                  onChange={(e) => setAmount(rowKey(category.id), e.target.value)}
                />
              </div>
              {category.subcategories.length > 0 && (
                <div className="flex flex-col gap-0.5 border-t border-divider bg-text/[0.02] py-1 pl-5">
                  {category.subcategories.map((sub) => (
                    <div key={sub.id} className="flex items-center gap-2 px-2 py-1 text-[13px]">
                      <span className="flex-1">↳ {sub.name}</span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        className="h-7 w-28 text-xs"
                        placeholder="—"
                        value={amounts[rowKey(category.id, sub.id)] ?? ""}
                        onChange={(e) => setAmount(rowKey(category.id, sub.id), e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

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
