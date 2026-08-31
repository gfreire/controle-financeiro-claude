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
import { InterestDialog } from "./interest-dialog";
import { formatCurrency } from "@/lib/utils/currency";
import { formatMonthLabel } from "@/lib/utils/date";
import { toPercentage } from "@/lib/utils/number";
import { deactivateAccountAction } from "../actions";
import { MoreVertical, ArrowLeftRight, CreditCard as CreditCardIcon, TriangleAlert } from "lucide-react";
import { AccountTypeIcon, ACCOUNT_TYPE_LABEL } from "@/components/ui/account-type-icon";
import type { AccountDTO, CardSummaryDTO, FinancialInstitutionDTO } from "@/types/dto";

// Same figure, same "usado/total" framing as the Cards page (getCardSummary#totalCommitted vs.
// creditLimit) — a credit card's "balance" here must never diverge from what /cards shows.
export function AccountCard({ account, institutions, cardSummary, cardSummaryMonth }: { account: AccountDTO; institutions: FinancialInstitutionDTO[]; cardSummary?: CardSummaryDTO; cardSummaryMonth?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const inconsistency = getInconsistency(account, cardSummary);

  return (
    <Card elevation="sm">
      <div className="flex items-start justify-between">
        <CardKicker className="flex items-center gap-1">
          <AccountTypeIcon type={account.type} className="size-3" />
          {ACCOUNT_TYPE_LABEL[account.type]}
          {inconsistency && (
            <span title={inconsistency} aria-label={inconsistency} className="text-danger-600">
              <TriangleAlert className="size-3.5" strokeWidth={1.5} />
            </span>
          )}
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
              {account.type === "BANK" && (
                <InterestDialog account={account} trigger={<DropdownMenuItem onSelect={(e) => e.preventDefault()}>Lançar Juros</DropdownMenuItem>} />
              )}
              {account.type !== "CREDIT_CARD" && (
                <BalanceAdjustDialog account={account} mode="reconcile" trigger={<DropdownMenuItem onSelect={(e) => e.preventDefault()}>Ajustar Saldo</DropdownMenuItem>} />
              )}
              <LimitAdjustDialog
                account={account}
                institutions={institutions}
                trigger={
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                    {account.type === "CREDIT_CARD" ? "Editar Cartão" : "Editar Conta"}
                  </DropdownMenuItem>
                }
              />
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
              <>
                <span className="text-sm opacity-60 tabular-nums">/ {formatCurrency(cardSummary.creditLimit)}</span>
                <span className="text-sm opacity-60 tabular-nums">
                  ({formatCurrency(Math.max(0, cardSummary.creditLimit - cardSummary.totalCommitted))})
                </span>
              </>
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
            {cardSummary.creditBalance > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-success-600">
                <span>Saldo a favor: <strong className="tabular-nums">{formatCurrency(cardSummary.creditBalance)}</strong></span>
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

/**
 * A single "this account's numbers don't add up" flag, surfaced as a red icon-only warning on the
 * card. Deliberately not aggregation (just a comparison of figures the DTO already carries, like
 * the existing `balance < 0` / `usagePercent >= 90` checks in this file) — the three cases the
 * user asked for:
 *  - CASH with a negative balance (physical cash can't go below zero).
 *  - BANK negative beyond its overdraft limit (cheque especial).
 *  - CREDIT_CARD committed above its informed limit (usually a bill payment not yet logged).
 */
function getInconsistency(account: AccountDTO, cardSummary?: CardSummaryDTO): string | null {
  if (account.type === "CASH" && account.balance < 0) {
    return `Conta em dinheiro com saldo negativo (${formatCurrency(account.balance)}) — dinheiro em espécie não fica negativo. Revise os lançamentos.`;
  }
  if (account.type === "BANK") {
    const overdraft = account.overdraftLimit ?? 0;
    if (account.balance < -overdraft) {
      return `Saldo negativo (${formatCurrency(account.balance)}) além do limite de cheque especial (${formatCurrency(overdraft)}). Revise os lançamentos ou o limite.`;
    }
  }
  if (
    account.type === "CREDIT_CARD" &&
    cardSummary?.creditLimit != null &&
    cardSummary.totalCommitted > cardSummary.creditLimit
  ) {
    return `Uso do cartão (${formatCurrency(cardSummary.totalCommitted)}) acima do limite informado (${formatCurrency(cardSummary.creditLimit)}). Pode faltar registrar um pagamento de fatura.`;
  }
  return null;
}
