import { getAccounts, getFinancialInstitutions } from "@/services/accounts.service";
import { getCardSummary } from "@/services/cards.service";
import { monthKey, todayIso } from "@/lib/utils/date";
import { AccountFormDialog } from "@/features/accounts/components/account-form-dialog";
import { AccountCard } from "@/features/accounts/components/account-card";
import { AccountsOverviewCharts } from "@/features/accounts/components/accounts-overview-charts";

export default async function AccountsPage() {
  const [accounts, institutions] = await Promise.all([getAccounts(), getFinancialInstitutions()]);
  const nonCards = accounts.filter((a) => a.type !== "CREDIT_CARD");
  const cards = accounts.filter((a) => a.type === "CREDIT_CARD");
  const month = monthKey(todayIso());
  // Same "usado/total" figure the Cards page shows (getCardSummary#totalCommitted vs. creditLimit)
  // — the two pages must never disagree about how much of a card's limit is in use.
  const cardSummaries = await Promise.all(cards.map((c) => getCardSummary(c.id, month, c.creditLimit ?? null)));
  const summaryByCardId = new Map(cards.map((c, i) => [c.id, cardSummaries[i]]));

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
          <AccountsOverviewCharts
            liquidAccounts={nonCards}
            cardEntries={cards.map((account) => ({ account, summary: summaryByCardId.get(account.id)! }))}
          />
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
                  <AccountCard key={account.id} account={account} cardSummary={summaryByCardId.get(account.id)} cardSummaryMonth={month} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
