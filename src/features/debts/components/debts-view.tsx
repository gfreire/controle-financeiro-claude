import { getDebts } from "@/services/debts.service";
import { getAccounts } from "@/services/accounts.service";
import { getCategories } from "@/services/categories.service";
import { DebtsCharts } from "./debts-charts";
import { DebtCard } from "./debt-card";
import type { DebtKind } from "@/types/database";

const EMPTY_LABEL: Record<DebtKind, string> = {
  PERSONAL: "Nenhuma dívida pessoal registrada.",
  OVERDUE_BILL: "Nenhuma conta em atraso registrada.",
  INSTALLMENT_PLAN: "Nenhum parcelamento programado registrado.",
};

const CHART_TITLES: Record<DebtKind, { payableTitle?: string; receivableTitle?: string }> = {
  PERSONAL: {},
  OVERDUE_BILL: { payableTitle: "Contas em atraso" },
  INSTALLMENT_PLAN: { payableTitle: "Parcelamentos programados" },
};

/**
 * Charts + list for one `debts.kind`. Every domain rule is unchanged from the old single
 * /debts screen — this just filters `getDebts()` down to one kind (and, for PERSONAL, an
 * optional side). See AI_CONTEXT.md "Dívidas — subtipos" → "Telas separadas".
 */
export async function DebtsView({
  kind,
  sideFilter = null,
}: {
  kind: DebtKind;
  /** PERSONAL only — the other kinds are always PAYABLE. */
  sideFilter?: "PAYABLE" | "RECEIVABLE" | null;
}) {
  const [allDebts, accounts, categories] = await Promise.all([getDebts(), getAccounts(), getCategories()]);
  const liquidAccounts = accounts.filter((a) => a.type !== "CREDIT_CARD");

  let debts = allDebts.filter((d) => d.kind === kind);
  if (sideFilter) debts = debts.filter((d) => d.side === sideFilter);

  return (
    <>
      <DebtsCharts debts={debts} {...CHART_TITLES[kind]} />

      {debts.length === 0 ? (
        <p className="text-sm opacity-60">
          {sideFilter ? "Nenhuma dívida nesse filtro." : EMPTY_LABEL[kind]}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {debts.map((debt) => (
            <DebtCard key={debt.id} debt={debt} accounts={liquidAccounts} categories={categories} />
          ))}
        </div>
      )}
    </>
  );
}
