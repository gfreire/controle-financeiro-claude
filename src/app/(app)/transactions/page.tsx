import { getTransactions } from "@/services/transactions.service";
import { getAccounts } from "@/services/accounts.service";
import { getCategories } from "@/services/categories.service";
import { startOfMonth, endOfMonth, monthKey, todayIso } from "@/lib/utils/date";
import { TransactionFormDialog } from "@/features/transactions/components/transaction-form-dialog";
import { TransactionExplorer } from "@/features/dashboard/components/transaction-explorer";
import { MonthNav } from "@/features/transactions/components/month-nav";

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const month = resolvedSearchParams.month ?? monthKey(todayIso());
  const periodStart = startOfMonth(`${month}-01`);
  const periodEnd = endOfMonth(`${month}-01`);

  const [transactions, accounts, categories] = await Promise.all([
    getTransactions({ periodStart, periodEnd }),
    getAccounts(),
    getCategories(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-heading text-2xl font-semibold">Lançamentos</h1>
        <div className="flex items-center gap-2">
          <MonthNav />
          <TransactionFormDialog accounts={accounts} categories={categories} />
        </div>
      </div>
      <TransactionExplorer transactions={transactions} categories={categories} />
    </div>
  );
}
