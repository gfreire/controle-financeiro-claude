import { getCategories } from "@/services/categories.service";
import { getBudgetMonthWindow } from "@/services/budgets.service";
import { formatMonthLabel } from "@/lib/utils/date";
import { OnboardingBudgetForm } from "./onboarding-budget-form";
import { ListTree } from "lucide-react";

/**
 * First-time-only step, reached right after picking starter categories (AI_CONTEXT.md
 * "Budgets"): plan this month's budget before landing on the dashboard. Skipping it is a valid,
 * no-op choice — the dashboard's budgets panel just shows a "Criar orçamento" CTA instead.
 */
export default async function OnboardingBudgetPage() {
  const [categories, monthWindow] = await Promise.all([getCategories(), getBudgetMonthWindow()]);

  return (
    <div className="mx-auto flex min-h-svh max-w-2xl flex-col justify-center gap-6 p-4">
      <div className="flex items-center gap-2">
        <ListTree className="size-6 text-accent" strokeWidth={1.5} />
        <h1 className="font-heading text-2xl font-semibold">Planejar orçamento de {formatMonthLabel(monthWindow.currentMonth)}</h1>
      </div>
      <p className="text-sm opacity-80">
        Defina quanto pretende gastar em cada categoria este mês — e, se quiser, reparta entre
        subcategorias. O que sobrar fica livre dentro da categoria. Não precisa preencher tudo
        agora: dá pra ajustar ou criar orçamentos novos a qualquer momento em Orçamentos.
      </p>
      <OnboardingBudgetForm categories={categories} month={monthWindow.currentMonth} />
    </div>
  );
}
