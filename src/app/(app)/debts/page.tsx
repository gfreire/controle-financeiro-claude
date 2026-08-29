import { getCategories } from "@/services/categories.service";
import { DebtFormDialog } from "@/features/debts/components/debt-form-dialog";
import { DebtsView } from "@/features/debts/components/debts-view";
import { DebtSideFilter } from "@/features/debts/components/debt-side-filter";
import { HelpButton } from "@/components/ui/help-button";

/**
 * "Dívidas Pessoais" — empréstimos entre pessoas (`debts.kind = PERSONAL`). Contas em atraso e
 * parcelamentos programados moraram aqui até 2026-08-29, quando ganharam telas próprias
 * (/overdue-bills, /installment-plans) a pedido do usuário — só a organização de forms/menus
 * mudou, nenhuma regra de domínio. Ver AI_CONTEXT.md "Dívidas — subtipos" → "Telas separadas".
 */
export default async function DebtsPage({
  searchParams,
}: {
  searchParams: Promise<{ side?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const sideFilter =
    resolvedSearchParams.side === "PAYABLE" || resolvedSearchParams.side === "RECEIVABLE" ? resolvedSearchParams.side : null;

  const categories = await getCategories();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="font-heading text-2xl font-semibold">Dívidas Pessoais</h1>
          <HelpButton title="Dívidas Pessoais">
            <p>Empréstimos entre pessoas (amigos, família) — podem ser <strong>a pagar</strong> ou <strong>a receber</strong>.</p>
            <p>Não afetam o resto do sistema: a urgência depende só do combinado entre as partes.</p>
            <p>&quot;Novo valor&quot; aumenta a dívida (com calculadora de juros opcional); &quot;Pagamento&quot; reduz.</p>
          </HelpButton>
        </div>
        <DebtFormDialog kind="PERSONAL" categories={categories} />
      </div>

      <DebtSideFilter />

      <DebtsView kind="PERSONAL" sideFilter={sideFilter} />
    </div>
  );
}
