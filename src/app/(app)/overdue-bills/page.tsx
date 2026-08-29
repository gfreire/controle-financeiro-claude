import { getCategories } from "@/services/categories.service";
import { DebtFormDialog } from "@/features/debts/components/debt-form-dialog";
import { DebtsView } from "@/features/debts/components/debts-view";
import { HelpButton } from "@/components/ui/help-button";

/**
 * "Contas em Atraso" — contas do dia a dia (água, luz, telefone, aluguel) que ficaram sem
 * pagar (`debts.kind = OVERDUE_BILL`). Separada de /debts em 2026-08-29 (só forms/menus, nenhuma
 * regra de domínio). Sempre PAYABLE; aparece projetada no dashboard como toda dívida
 * OVERDUE_BILL. Ver AI_CONTEXT.md "Dívidas — subtipos".
 */
export default async function OverdueBillsPage() {
  const categories = await getCategories();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="font-heading text-2xl font-semibold">Contas em Atraso</h1>
          <HelpButton title="Contas em Atraso">
            <p>Contas do dia a dia (luz, água, telefone, aluguel) que passaram do vencimento.</p>
            <p>Sempre aparecem projetadas no Dashboard, em &quot;Despesas do mês&quot;, até serem pagas.</p>
            <p>&quot;Novo valor&quot; aumenta o que falta (juros/multa); &quot;Pagamento&quot; reduz.</p>
          </HelpButton>
        </div>
        <DebtFormDialog kind="OVERDUE_BILL" categories={categories} />
      </div>

      <DebtsView kind="OVERDUE_BILL" />
    </div>
  );
}
