"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardKicker, CardTitle, CardMeta } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { BalanceAdjustDialog } from "./balance-adjust-dialog";
import { LimitAdjustDialog } from "./limit-adjust-dialog";
import { formatCurrency } from "@/lib/utils/currency";
import { deactivateAccountAction } from "../actions";
import { MoreVertical } from "lucide-react";
import { AccountTypeIcon, ACCOUNT_TYPE_LABEL } from "@/components/ui/account-type-icon";
import type { AccountDTO } from "@/types/dto";

export function AccountCard({ account }: { account: AccountDTO }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Card elevation="sm">
      <div className="flex items-start justify-between">
        <CardKicker className="flex items-center gap-1">
          <AccountTypeIcon type={account.type} className="size-3" />
          {ACCOUNT_TYPE_LABEL[account.type]}
        </CardKicker>
        <DropdownMenu>
          <DropdownMenuTrigger className="text-text/50 hover:text-text"><MoreVertical className="size-4" /></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {account.type === "BANK" && (
              <BalanceAdjustDialog account={account} mode="yield" trigger={<DropdownMenuItem onSelect={(e) => e.preventDefault()}>Informar Rendimento</DropdownMenuItem>} />
            )}
            {account.type !== "CREDIT_CARD" && (
              <BalanceAdjustDialog account={account} mode="reconcile" trigger={<DropdownMenuItem onSelect={(e) => e.preventDefault()}>Ajustar Saldo</DropdownMenuItem>} />
            )}
            {(account.type === "BANK" || account.type === "CREDIT_CARD") && (
              <LimitAdjustDialog account={account} trigger={<DropdownMenuItem onSelect={(e) => e.preventDefault()}>Ajustar Limite</DropdownMenuItem>} />
            )}
            <DropdownMenuItem
              disabled={pending}
              onSelect={() => startTransition(async () => {
                await deactivateAccountAction(account.id);
                router.refresh();
              })}
            >
              Desativar conta
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <CardTitle>{account.name}</CardTitle>
      <div className={`text-xl font-semibold tabular-nums ${account.balance < 0 ? "text-danger-600" : ""}`}>
        {formatCurrency(account.balance)}
      </div>
      {account.institutionName && (
        <CardMeta>
          <span className="size-2" style={{ background: account.institutionColor ?? "var(--color-accent)" }} />
          {account.institutionName}
        </CardMeta>
      )}
      {account.type === "CREDIT_CARD" && (
        <CardMeta>Fecha dia {account.closingDay} · vence dia {account.dueDay}</CardMeta>
      )}
    </Card>
  );
}
