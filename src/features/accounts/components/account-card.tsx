"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardKicker, CardTitle, CardMeta } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { InvoicePaidBadge } from "@/components/ui/invoice-paid-badge";
import { BalanceAdjustDialog } from "./balance-adjust-dialog";
import { LimitAdjustDialog } from "./limit-adjust-dialog";
import { formatCurrency } from "@/lib/utils/currency";
import { formatMonthLabel } from "@/lib/utils/date";
import { toPercentage } from "@/lib/utils/number";
import { deactivateAccountAction } from "../actions";
import { MoreVertical, ArrowLeftRight, CreditCard as CreditCardIcon } from "lucide-react";
import { AccountTypeIcon, ACCOUNT_TYPE_LABEL } from "@/components/ui/account-type-icon";
import type { AccountDTO, CardSummaryDTO } from "@/types/dto";

// Same figure, same "usado/total" framing as the Cards page (getCardSummary#totalCommitted vs.
// creditLimit) — a credit card's "balance" here must never diverge from what /cards shows.
export function AccountCard({ account, cardSummary, cardSummaryMonth }: { account: AccountDTO; cardSummary?: CardSummaryDTO; cardSummaryMonth?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Card elevation="sm">
      <div className="flex items-start justify-between">
        <CardKicker className="flex items-center gap-1">
          <AccountTypeIcon type={account.type} className="size-3" />
          {ACCOUNT_TYPE_LABEL[account.type]}
        </CardKicker>
        <div className="flex items-center gap-2">
          <Link
            href={`/transactions?accountId=${account.id}`}
            title="Ver movimentações desta conta"
            className="text-text/50 hover:text-accent"
          >
            <ArrowLeftRight className="size-3.5" strokeWidth={1.5} />
          </Link>
          {account.type === "CREDIT_CARD" && (
            <Link
              href={`/cards?cardId=${account.id}`}
              title="Ver fatura deste cartão"
              className="text-text/50 hover:text-accent"
            >
              <CreditCardIcon className="size-3.5" strokeWidth={1.5} />
            </Link>
          )}
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
                <LimitAdjustDialog
                  account={account}
                  trigger={
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                      {account.type === "CREDIT_CARD" ? "Ajustar Cartão" : "Ajustar Limite"}
                    </DropdownMenuItem>
                  }
                />
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
      </div>
      <CardTitle>{account.name}</CardTitle>
      {account.type === "CREDIT_CARD" && cardSummary ? (
        <>
          <div className="flex items-baseline gap-1">
            <span className={`text-xl font-semibold tabular-nums ${usagePercent(cardSummary) !== null && usagePercent(cardSummary)! >= 90 ? "text-danger-600" : ""}`}>
              {formatCurrency(cardSummary.totalCommitted)}
            </span>
            {cardSummary.creditLimit !== null && (
              <span className="text-sm opacity-60 tabular-nums">/ {formatCurrency(cardSummary.creditLimit)}</span>
            )}
          </div>
          {cardSummary.creditLimit !== null && (
            <div className="mt-1 h-1.5 w-40 bg-neutral-200">
              <div
                className={usagePercent(cardSummary) !== null && usagePercent(cardSummary)! >= 90 ? "h-full bg-danger-500" : "h-full bg-accent"}
                style={{ width: `${usagePercent(cardSummary) ?? 0}%` }}
              />
            </div>
          )}
          <div className="mt-2 flex flex-col gap-1 text-xs opacity-70">
            <div className="flex flex-wrap items-center gap-2">
              {cardSummaryMonth && (
                <span>Fatura de {formatMonthLabel(cardSummaryMonth)}: <strong className="tabular-nums">{formatCurrency(cardSummary.currentMonthInvoice)}</strong></span>
              )}
              <InvoicePaidBadge invoiceAmount={cardSummary.currentMonthInvoice} paidAmount={cardSummary.currentMonthPaidAmount} />
              {cardSummary.overdueAmount > 0 && <Badge variant="danger">Em atraso: {formatCurrency(cardSummary.overdueAmount)}</Badge>}
            </div>
            {cardSummaryMonth && cardSummary.openInvoiceMonth !== cardSummaryMonth && (
              <div className="flex flex-wrap items-center gap-2">
                <span>Fatura aberta ({formatMonthLabel(cardSummary.openInvoiceMonth)}): <strong className="tabular-nums">{formatCurrency(cardSummary.openInvoiceAmount)}</strong></span>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className={`text-xl font-semibold tabular-nums ${account.balance < 0 ? "text-danger-600" : ""}`}>
          {formatCurrency(account.balance)}
        </div>
      )}
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

function usagePercent(summary: CardSummaryDTO): number | null {
  return summary.creditLimit ? toPercentage(summary.totalCommitted, summary.creditLimit) : null;
}
