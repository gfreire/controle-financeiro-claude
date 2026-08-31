"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { BudgetTreeFields, rowKey, type RowKey } from "@/features/budgets/components/budget-tree-fields";
import { createBudgetAction } from "@/features/budgets/actions";
import { formatCurrency } from "@/lib/utils/currency";
import type { CategoryDTO, FixedExpenseDTO } from "@/types/dto";

export function OnboardingBudgetForm({
  categories,
  fixedExpenses,
  month,
}: {
  categories: CategoryDTO[];
  fixedExpenses: FixedExpenseDTO[];
  month: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [amounts, setAmounts] = useState<Record<RowKey, string>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [notices, setNotices] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  function setAmount(key: RowKey, value: string) {
    setAmounts((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    setErrors([]);
    setNotices([]);
    startTransition(async () => {
      const allErrors: string[] = [];
      const allNotices: string[] = [];
      const expenseCategories = categories.filter((c) => c.type === "EXPENSE" && !c.isSystem); // keep in sync with BudgetTreeFields

      function floorFor(categoryId: string, subcategoryId: string | undefined): number {
        if (subcategoryId) {
          return fixedExpenses.filter((f) => f.subcategoryId === subcategoryId).reduce((sum, f) => sum + f.plannedAmount, 0);
        }
        const category = expenseCategories.find((c) => c.id === categoryId);
        const subSum = (category?.subcategories ?? []).reduce((sum, s) => sum + (Number(amounts[rowKey(categoryId, s.id)]) || 0), 0);
        const directFixed = fixedExpenses.filter((f) => f.categoryId === categoryId && !f.subcategoryId).reduce((sum, f) => sum + f.plannedAmount, 0);
        return subSum + directFixed;
      }

      async function saveRow(categoryId: string, subcategoryId: string | undefined, label: string) {
        const raw = amounts[rowKey(categoryId, subcategoryId)];
        if (raw === undefined || raw.trim() === "") return;
        const amount = Number(raw);
        if (!Number.isFinite(amount) || amount <= 0) return;
        const floor = floorFor(categoryId, subcategoryId);
        if (amount < floor) {
          allErrors.push(`${label}: valor não pode ser menor que ${formatCurrency(floor)}`);
          return;
        }
        try {
          const result = await createBudgetAction({ categoryId, subcategoryId, amount, month });
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

      if (allErrors.length === 0 && allNotices.length === 0) {
        router.push("/dashboard");
      } else {
        setErrors(allErrors);
        setNotices(allNotices);
        setDone(true);
      }
    });
  }

  if (done) {
    return (
      <div className="flex flex-col gap-4">
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
        <Button asChild><Link href="/dashboard">Continuar para o Dashboard</Link></Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <BudgetTreeFields categories={categories} amounts={amounts} onChange={setAmount} fixedExpenses={fixedExpenses} />
      <div className="flex gap-2">
        <Button asChild variant="secondary" className="flex-1"><Link href="/dashboard">Pular</Link></Button>
        <Button className="flex-1" disabled={pending} onClick={handleSave}>{pending ? "Salvando..." : "Salvar e continuar"}</Button>
      </div>
    </div>
  );
}
