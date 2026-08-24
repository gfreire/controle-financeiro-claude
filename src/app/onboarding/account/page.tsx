import { getAccounts } from "@/services/accounts.service";
import { OnboardingAccountForm } from "./onboarding-account-form";
import { Wallet } from "lucide-react";
import { redirect } from "next/navigation";

/**
 * First-time-only step, now the very first onboarding screen (AI_CONTEXT.md "Onboarding —
 * conta padrão", reordered 2026-08-24 at the user's request — account confirmation before
 * category picking reads more naturally as "here's your starting point" than picking categories
 * first): the signup trigger (migration 0025) already created a "Carteira" CASH account with
 * balance 0, so a brand-new user never lands on an empty dashboard unable to log anything. This
 * step only asks for the real current balance — everything else about the account is already
 * set. If for some reason no CASH account exists (shouldn't happen post-migration, but defensive
 * for edge cases), skip straight to category picking instead of erroring.
 */
export default async function OnboardingAccountPage() {
  const accounts = await getAccounts();
  const wallet = accounts.find((a) => a.type === "CASH") ?? accounts[0];
  if (!wallet) redirect("/onboarding");

  return (
    <div className="mx-auto flex min-h-svh max-w-2xl flex-col justify-center gap-6 p-4">
      <div className="flex items-center gap-2">
        <Wallet className="size-6 text-accent" strokeWidth={1.5} />
        <h1 className="font-heading text-2xl font-semibold">Sua primeira conta</h1>
      </div>
      <p className="text-sm opacity-80">
        Já criamos a conta <strong>&quot;{wallet.name}&quot;</strong> (dinheiro) pra você começar. Quanto você tem nela agora?
      </p>
      <p className="text-xs opacity-60">
        Você pode cadastrar quantas contas bancárias e cartões de crédito quiser depois, em Contas e Cartões — isso aqui é só pra não começar do zero.
      </p>
      <OnboardingAccountForm accountId={wallet.id} />
    </div>
  );
}
