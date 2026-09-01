import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/card";
import { CardTitleWithHelp } from "@/components/ui/help-hint";
import { Button } from "@/components/ui/button";
import { BudgetTree } from "@/features/budgets/components/budget-tree";
import { PlusCircle } from "lucide-react";
import type { BudgetTreeCategoryDTO } from "@/types/dto";

/**
 * Read-only view of the same tree grouping `/budgets` uses (`BudgetTree`) — no edit/delete
 * affordances here, this panel is just a glance. Fixed expenses are already nested under their
 * parent budget/subcategory inside each `BudgetTreeCategoryDTO` (AI_CONTEXT.md "Budget hierarchy").
 */
export function BudgetsPanel({ categories }: { categories: BudgetTreeCategoryDTO[] }) {
  if (categories.length === 0) {
    return (
      <Card elevation="sm">
        <CardTitle>Orçamentos e despesas programadas</CardTitle>
        <p className="text-sm opacity-60">Nenhum orçamento ou despesa programada configurada ainda.</p>
        <Button asChild size="sm" variant="secondary" className="w-fit">
          <Link href="/budgets"><PlusCircle className="size-3.5" strokeWidth={1.5} /> Criar orçamento</Link>
        </Button>
      </Card>
    );
  }

  return (
    <Card elevation="sm" className="gap-4">
      <CardTitleWithHelp
        id="dashboard.budgets-panel"
        helpTitle="Orçamentos e despesas programadas"
        help={
          <>
            <p>Quanto você planejou gastar por categoria neste mês, versus o que já gastou. É só um alerta — nunca bloqueia nada.</p>
            <p>As despesas programadas (aluguel, streaming) aparecem aninhadas na categoria delas. Edite tudo na tela de Orçamentos.</p>
          </>
        }
      >
        Orçamentos e despesas programadas
      </CardTitleWithHelp>
      <BudgetTree categories={categories} />
    </Card>
  );
}
