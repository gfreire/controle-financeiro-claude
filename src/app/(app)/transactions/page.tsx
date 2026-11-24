import { getTransactions } from "@/services/transactions.service";
import { getAccounts } from "@/services/accounts.service";
import { getCardBalanceThroughMonth } from "@/services/cards.service";
import { getCategories } from "@/services/categories.service";
import { startOfMonth, endOfMonth, monthKey, todayIso } from "@/lib/utils/date";
import { TransactionFormDialog } from "@/features/transactions/components/transaction-form-dialog";
import { TransactionExplorer } from "@/features/dashboard/components/transaction-explorer";
import { MonthNav } from "@/features/transactions/components/month-nav";
import { TransactionFilters } from "@/features/transactions/components/transaction-filters";
import { HelpButton } from "@/components/ui/help-button";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; type?: string; accountId?: string; categoryId?: string; subcategoryId?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const month = resolvedSearchParams.month ?? monthKey(todayIso());
  const periodStart = startOfMonth(`${month}-01`);
  const periodEnd = endOfMonth(`${month}-01`);

  const [transactions, accounts, categories] = await Promise.all([
    getTransactions({
      periodStart,
      periodEnd,
      type: resolvedSearchParams.type as "INCOME" | "EXPENSE" | "TRANSFER" | "CREDIT_CARD_PAYMENT" | "RESERVE" | "REDEEM" | undefined,
      accountId: resolvedSearchParams.accountId,
      categoryId: resolvedSearchParams.categoryId,
      subcategoryId: resolvedSearchParams.subcategoryId,
    }),
    getAccounts(),
    getCategories(),
  ]);

  // "Pagar Fatura" suggestion in the "Nova movimentação" picker — same figure as /cards uses
  // (CardSummaryDTO.usedThroughCurrentMonth), anchored to today's real month.
  const todayMonth = monthKey(todayIso());
  const statementBalances = Object.fromEntries(
    await Promise.all(
      accounts.filter((a) => a.type === "CREDIT_CARD").map(async (c) => [c.id, await getCardBalanceThroughMonth(c.id, todayMonth)] as const),
    ),
  ) as Record<string, number>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="font-heading text-2xl font-semibold">Movimentações</h1>
          <HelpButton title="Movimentações">
            <p>Todos os seus lançamentos do mês — receitas, despesas e transferências entre contas.</p>
            <p>Categoria e descrição podem ser editadas direto na lista. Pagamentos de fatura de cartão aparecem aqui e podem ser lançados por Nova movimentação → Pagar Fatura.</p>
          </HelpButton>
        </div>
        <div className="flex items-center gap-2">
          <MonthNav />
          <TransactionFormDialog accounts={accounts} categories={categories} statementBalances={statementBalances} />
        </div>
      </div>
      <TransactionFilters accounts={accounts} categories={categories} />
      <TransactionExplorer transactions={transactions} categories={categories} accounts={accounts} />
    </div>
  );
}
