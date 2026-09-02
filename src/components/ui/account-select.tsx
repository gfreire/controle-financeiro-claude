"use client";

import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AccountTypeIcon, ACCOUNT_TYPE_LABEL } from "@/components/ui/account-type-icon";
import { formatCurrency } from "@/lib/utils/currency";
import type { AccountDTO } from "@/types/dto";
import type { AccountType } from "@/types/database";

const TYPE_ORDER: AccountType[] = ["CASH", "BANK", "CREDIT_CARD"];

/**
 * Standard account picker: groups accounts by type (same CASH/BANK/CREDIT_CARD order as the
 * Accounts page) with a labeled SelectGroup per type, and shows each account's type icon next to
 * its name — a bank account and a credit card can share the exact same name (e.g. both named
 * after the same institution), so the icon is what actually disambiguates them, not the label.
 */
export function AccountSelect({
  accounts,
  value,
  onChange,
  noneValue,
  noneLabel,
  placeholder = "Selecione",
  triggerClassName,
}: {
  accounts: AccountDTO[];
  value: string;
  onChange: (id: string) => void;
  noneValue?: string;
  noneLabel?: string;
  placeholder?: string;
  triggerClassName?: string;
}) {
  const groups = TYPE_ORDER.map((type) => ({ type, accounts: accounts.filter((a) => a.type === type) })).filter(
    (g) => g.accounts.length > 0
  );

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={triggerClassName}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {noneValue !== undefined && <SelectItem value={noneValue}>{noneLabel ?? "Nenhuma"}</SelectItem>}
        {groups.map((group) => (
          <SelectGroup key={group.type}>
            <SelectLabel>{ACCOUNT_TYPE_LABEL[group.type]}</SelectLabel>
            {group.accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                <span className="inline-flex items-center gap-1.5">
                  <AccountTypeIcon type={a.type} className="size-3.5 opacity-70" />
                  {a.name}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * "Saldo: R$ X" line shown right under an account picker once an account is chosen. Renders
 * nothing when `accountId` doesn't match any account in `accounts` (e.g. still on a "none"
 * sentinel, or the picker is filtered so the selected id isn't present). Pass the same list
 * given to the picker so the lookup always resolves.
 */
export function AccountBalanceHint({
  accounts,
  accountId,
}: {
  accounts: AccountDTO[];
  accountId: string | null | undefined;
}) {
  const account = accounts.find((a) => a.id === accountId);
  if (!account) return null;
  return <p className="mt-1 text-[11px] opacity-60">Saldo: {formatCurrency(account.balance)}</p>;
}
