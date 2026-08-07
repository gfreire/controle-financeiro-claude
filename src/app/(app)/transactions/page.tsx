import { getTransactions } from "@/services/transactions.service";
import { getAccounts } from "@/services/accounts.service";
import { getCategories } from "@/services/categories.service";
import { TransactionFormDialog } from "@/features/transactions/components/transaction-form-dialog";
import { TransactionExplorer } from "@/features/dashboard/components/transaction-explorer";

export default async function TransactionsPage() {
  const [transactions, accounts, categories] = await Promise.all([getTransactions(), getAccounts(), getCategories()]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-semibold">Lançamentos</h1>
        <TransactionFormDialog accounts={accounts} categories={categories} />
      </div>
      <TransactionExplorer transactions={transactions} categories={categories} />
    </div>
  );
}
