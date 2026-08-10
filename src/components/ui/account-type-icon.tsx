import { Banknote, Landmark, CreditCard, type LucideIcon } from "lucide-react";
import type { AccountType } from "@/types/database";

/**
 * Presentational only — no business logic depends on this. CASH gets "cédulas" (Banknote),
 * BANK gets a bank building (Landmark — Wallet read too much like cash itself, confusing
 * against CASH's own icon), CREDIT_CARD gets CreditCard. Shared between the Accounts page and
 * the transaction lists so the same account always reads the same way everywhere.
 */
export const ACCOUNT_TYPE_ICON: Record<AccountType, LucideIcon> = {
  CASH: Banknote,
  BANK: Landmark,
  CREDIT_CARD: CreditCard,
};

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  CASH: "Dinheiro",
  BANK: "Conta bancária",
  CREDIT_CARD: "Cartão de crédito",
};

export function AccountTypeIcon({ type, className }: { type: AccountType; className?: string }) {
  const Icon = ACCOUNT_TYPE_ICON[type];
  return <Icon className={className ?? "size-3.5"} strokeWidth={1.5} />;
}
