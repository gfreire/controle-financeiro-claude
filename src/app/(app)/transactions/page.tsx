import { getTransactions } from "@/services/transactions.service";
import { getAccounts } from "@/services/accounts.service";
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
      type: resolvedSearchParams.type as "INCOME" | "EXPENSE" | "TRANSFER" | "CREDIT_CARD_PAYMENT" | undefined,
      accountId: resolvedSearchParams.accountId,
      categoryId: resolvedSearchParams.categoryId,
      subcategoryId: resolvedSearchParams.subcategoryId,
    }),
    getAccounts(),
    getCategories(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="font-heading text-2xl font-semibold">Movimentações</h1>
          <HelpButton title="Movimentações">
            <p>Todos os seus lançamentos do mês — receitas, despesas e transferências entre contas.</p>
            <p>Categoria e descrição podem ser editadas direto na lista. Pagamentos de fatura de cartão aparecem aqui, mas só são criados pela tela de Cartões.</p>
          </HelpButton>
        </div>
        <div className="flex items-center gap-2">
          <MonthNav />
          <TransactionFormDialog accounts={accounts} categories={categories} />
        </div>
      </div>
      <TransactionFilters accounts={accounts} categories={categories} />
      <TransactionExplorer transactions={transactions} categories={categories} accounts={accounts} />
    </div>
  );
}
