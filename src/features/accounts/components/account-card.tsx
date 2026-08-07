"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardKicker, CardTitle, CardMeta } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { BalanceAdjustDialog } from "./balance-adjust-dialog";
import { formatCurrency } from "@/lib/utils/currency";
import { deactivateAccountAction } from "../actions";
import { MoreVertical, Wallet, Landmark, CreditCard } from "lucide-react";
import type { AccountDTO } from "@/types/dto";

const TYPE_ICON = { CASH: Wallet, BANK: Landmark, CREDIT_CARD: CreditCard };
const TYPE_LABEL = { CASH: "Dinheiro", BANK: "Conta bancária", CREDIT_CARD: "Cartão de crédito" };

export function AccountCard({ account }: { account: AccountDTO }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const Icon = TYPE_ICON[account.type];

  return (
    <Card elevation="sm">
      <div className="flex items-start justify-between">
        <CardKicker className="flex items-center gap-1">
          <Icon className="size-3" strokeWidth={1.5} />
          {TYPE_LABEL[account.type]}
        </CardKicker>
        <DropdownMenu>
          <DropdownMenuTrigger className="text-text/50 hover:text-text"><MoreVertical className="size-4" /></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {account.type !== "CREDIT_CARD" && (
              <>
                <BalanceAdjustDialog account={account} mode="yield" trigger={<DropdownMenuItem onSelect={(e) => e.preventDefault()}>Informar Rendimento</DropdownMenuItem>} />
                <BalanceAdjustDialog account={account} mode="reconcile" trigger={<DropdownMenuItem onSelect={(e) => e.preventDefault()}>Ajustar Saldo</DropdownMenuItem>} />
              </>
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
