import { getAccounts, getFinancialInstitutions } from "@/services/accounts.service";
import { AccountFormDialog } from "@/features/accounts/components/account-form-dialog";
import { AccountCard } from "@/features/accounts/components/account-card";

export default async function AccountsPage() {
  const [accounts, institutions] = await Promise.all([getAccounts(), getFinancialInstitutions()]);
  const nonCards = accounts.filter((a) => a.type !== "CREDIT_CARD");
  const cards = accounts.filter((a) => a.type === "CREDIT_CARD");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-semibold">Contas</h1>
        <AccountFormDialog institutions={institutions} />
      </div>

      {accounts.length === 0 ? (
        <p className="text-sm opacity-60">Nenhuma conta cadastrada ainda. Crie sua primeira conta para começar.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {nonCards.map((account) => (
              <AccountCard key={account.id} account={account} />
            ))}
          </div>
          {cards.length > 0 && (
            <>
              <h2 className="mt-2 font-heading text-lg font-semibold">Cartões de crédito</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {cards.map((account) => (
                  <AccountCard key={account.id} account={account} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
