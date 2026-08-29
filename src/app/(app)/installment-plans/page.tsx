import { getCategories } from "@/services/categories.service";
import { DebtFormDialog } from "@/features/debts/components/debt-form-dialog";
import { DebtsView } from "@/features/debts/components/debts-view";
import { HelpButton } from "@/components/ui/help-button";

/**
 * "Parcelamento Programado" — compra parcelada fora do cartão (boleto, financiamento de loja) ou
 * acordo informal com valor mensal combinado (`debts.kind = INSTALLMENT_PLAN`). Separada de
 * /debts em 2026-08-29 (só forms/menus, nenhuma regra de domínio). Sempre PAYABLE; carrega
 * valor mensal + dia de vencimento e um lembrete mensal. Ver AI_CONTEXT.md "Dívidas — subtipos".
 */
export default async function InstallmentPlansPage() {
  const categories = await getCategories();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="font-heading text-2xl font-semibold">Parcelamento Programado</h1>
          <HelpButton title="Parcelamento Programado">
            <p>Compra parcelada fora do cartão (boleto, financiamento) ou acordo com valor mensal combinado.</p>
            <p>Você define o valor por mês e o dia de vencimento — o Dashboard lembra e projeta em &quot;Despesas do mês&quot;.</p>
            <p>&quot;Pagamento&quot; já vem preenchido com o valor mensal combinado; &quot;Novo valor&quot; aumenta o saldo.</p>
          </HelpButton>
        </div>
        <DebtFormDialog kind="INSTALLMENT_PLAN" categories={categories} />
      </div>

      <DebtsView kind="INSTALLMENT_PLAN" />
    </div>
  );
}
