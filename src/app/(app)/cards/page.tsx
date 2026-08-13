import { getAccounts } from "@/services/accounts.service";
import { getCategories } from "@/services/categories.service";
import { getCardInstallments, getCardPurchases, getCardSummary, getCardTotalCommitted } from "@/services/cards.service";
import { Card, CardKicker, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InvoicePaidBadge } from "@/components/ui/invoice-paid-badge";
import { formatCurrency } from "@/lib/utils/currency";
import { startOfMonth, endOfMonth, monthKey, todayIso, formatMonthLabel, formatDate } from "@/lib/utils/date";
import { toPercentage } from "@/lib/utils/number";
import { PurchaseFormDialog } from "@/features/cards/components/purchase-form-dialog";
import { PaymentFormDialog } from "@/features/cards/components/payment-form-dialog";
import { DeletePurchaseButton } from "@/features/cards/components/delete-purchase-button";
import { MonthNav } from "@/features/cards/components/month-nav";
import { CardFilters } from "@/features/cards/components/card-filters";
import { EditableCategoryCell } from "@/features/dashboard/components/editable-category-cell";
import { Button } from "@/components/ui/button";
import { CreditCard, Receipt, Pencil } from "lucide-react";
import { textIncludes } from "@/lib/utils/normalize";

export default async function CardsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; cardId?: string; categoryId?: string; subcategoryId?: string; q?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const month = resolvedSearchParams.month ?? monthKey(todayIso());
  const { cardId, categoryId, subcategoryId, q } = resolvedSearchParams;

  const [accounts, categories] = await Promise.all([getAccounts(), getCategories()]);
  const allCards = accounts.filter((a) => a.type === "CREDIT_CARD");
  const cards = cardId ? allCards.filter((c) => c.id === cardId) : allCards;
  const payerAccounts = accounts.filter((a) => a.type !== "CREDIT_CARD");

  // Passed to PurchaseFormDialog's over-limit warning — the correct "used against the limit"
  // figure (excludes paid_before_system installments), unlike AccountDTO.balance.
  const cardTotals: Record<string, number> = Object.fromEntries(
    await Promise.all(allCards.map(async (c) => [c.id, await getCardTotalCommitted(c.id)] as const))
  );

  const periodStart = startOfMonth(`${month}-01`);
  const periodEnd = endOfMonth(`${month}-01`);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-heading text-2xl font-semibold">Cartões</h1>
        <div className="flex items-center gap-2">
          <MonthNav />
          <PurchaseFormDialog cards={allCards} cardTotals={cardTotals} categories={categories} />
        </div>
      </div>

      <CardFilters cards={allCards} categories={categories} />

      {allCards.length === 0 ? (
        <p className="text-sm opacity-60">Nenhum cartão cadastrado. Crie um cartão de crédito na página de Contas.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {await Promise.all(
            cards.map(async (card) => {
              const [installmentsRaw, purchases, summary] = await Promise.all([
                getCardInstallments(card.id, { periodStart, periodEnd }),
                getCardPurchases(card.id),
                // `month` here is the page's viewed/filtered month — drives `currentMonthInvoice`.
                // `usedThroughCurrentMonth`/`overdueAmount` inside stay anchored to today regardless.
                getCardSummary(card.id, month, card.creditLimit ?? null),
              ]);
              const purchaseById = new Map(purchases.map((p) => [p.id, p]));
              const installments = installmentsRaw.filter((r) => {
                const purchase = purchaseById.get(r.purchaseId);
                if (categoryId && purchase?.categoryId !== categoryId) return false;
                if (subcategoryId && purchase?.subcategoryId !== subcategoryId) return false;
                if (q) {
                  const description = r.description || purchase?.subcategoryName || purchase?.categoryName || "";
                  if (!textIncludes(description, q)) return false;
                }
                return true;
              });
              // Against-the-limit usage must include future not-yet-due installments too — see
              // `getCardTotalCommitted`'s comment for why `usedThroughCurrentMonth` alone undercounts it.
              const usagePercent = summary.creditLimit ? toPercentage(summary.totalCommitted, summary.creditLimit) : null;

              return (
                <Card key={card.id} elevation="sm" className="gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <CardKicker className="flex items-center gap-1">
                        <CreditCard className="size-3" strokeWidth={1.5} />
                        Fecha dia {card.closingDay} · vence dia {card.dueDay}
                      </CardKicker>
                      <CardTitle>{card.name}</CardTitle>
                      <div className="flex items-baseline gap-1">
                        <span className={`text-xl font-semibold tabular-nums ${usagePercent !== null && usagePercent >= 90 ? "text-danger-600" : ""}`}>
                          {formatCurrency(summary.totalCommitted)}
                        </span>
                        {summary.creditLimit !== null && (
                          <span className="text-sm opacity-60 tabular-nums">/ {formatCurrency(summary.creditLimit)}</span>
                        )}
                      </div>
                      {summary.creditLimit !== null && (
                        <div className="mt-1 h-1.5 w-40 bg-neutral-200">
                          <div className={usagePercent !== null && usagePercent >= 90 ? "h-full bg-danger-500" : "h-full bg-accent"} style={{ width: `${usagePercent ?? 0}%` }} />
                        </div>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs opacity-70">
                        <span>Fatura de {formatMonthLabel(month)}: <strong className="tabular-nums">{formatCurrency(summary.currentMonthInvoice)}</strong></span>
                        <InvoicePaidBadge invoiceAmount={summary.currentMonthInvoice} paidAmount={summary.currentMonthPaidAmount} />
                        {summary.overdueAmount > 0 && (
                          <Badge variant="danger">Em atraso: {formatCurrency(summary.overdueAmount)}</Badge>
                        )}
                      </div>
                    </div>
                    <PaymentFormDialog
                      card={card}
                      payerAccounts={payerAccounts}
                      statementBalance={summary.usedThroughCurrentMonth}
                      trigger={<Button size="sm" variant="secondary"><Receipt className="size-3.5" strokeWidth={1.5} /> Pagar fatura</Button>}
                    />
                  </div>

                  {installments.length === 0 ? (
                    <p className="text-xs opacity-50">Sem compras neste mês.</p>
                  ) : (
                    <div className="flex flex-col divide-y divide-neutral-200">
                      {installments.map((r) => {
                        const purchase = purchaseById.get(r.purchaseId);
                        const description =
                          r.description || purchase?.subcategoryName || purchase?.categoryName || "Gasto com cartão";
                        const editActions = purchase && (
                          <>
                            <PurchaseFormDialog
                              cards={cards}
                              cardTotals={cardTotals}
                              categories={categories}
                              purchase={purchase}
                              trigger={
                                <button className="p-1.5 -m-1.5 text-text/40 hover:text-accent" aria-label="Editar compra">
                                  <Pencil className="size-3.5" strokeWidth={1.5} />
                                </button>
                              }
                            />
                            <DeletePurchaseButton purchaseId={purchase.id} description={purchase.description} />
                          </>
                        );
                        const categoryRow = {
                          id: r.id,
                          source: "installment" as const,
                          purchaseId: r.purchaseId,
                          type: "EXPENSE" as const,
                          categoryId: purchase?.categoryId ?? null,
                          subcategoryId: purchase?.subcategoryId ?? null,
                        };
                        return (
                          <div key={r.id} className="py-2.5">
                            {/* Mobile-only: linha 1 = data/descrição+parcela | valor | ações; linha 2 = categoria | subcategoria */}
                            <div className="flex flex-col gap-2 sm:hidden">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm">
                                    <span className="tabular-nums opacity-60">{formatDate(r.purchaseDate)}</span> - {description}
                                  </p>
                                  <p className="text-xs tabular-nums opacity-50">
                                    {r.installmentNumber}/{r.totalInstallments}
                                    {r.paidBeforeSystem && <Badge variant="outline" className="ml-2">paga antes do sistema</Badge>}
                                  </p>
                                </div>
                                <span className="shrink-0 text-sm font-medium tabular-nums">{formatCurrency(r.amount)}</span>
                                <div className="flex shrink-0 items-center gap-2">{editActions}</div>
                              </div>
                              <EditableCategoryCell row={categoryRow} categories={categories} layout="row" />
                            </div>

                            {/* Desktop/tablet: linha única */}
                            <div className="hidden items-center gap-3 sm:flex">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm">
                                  <span className="tabular-nums opacity-60">{formatDate(r.purchaseDate)}</span> - {description}
                                </p>
                                <p className="text-xs tabular-nums opacity-50">
                                  {r.installmentNumber}/{r.totalInstallments}
                                  {r.paidBeforeSystem && <Badge variant="outline" className="ml-2">paga antes do sistema</Badge>}
                                </p>
                              </div>
                              <div className="w-24 shrink-0 text-right text-sm font-medium tabular-nums">
                                {formatCurrency(r.amount)}
                              </div>
                              <div className="w-40 shrink-0">
                                <EditableCategoryCell row={categoryRow} categories={categories} />
                              </div>
                              <div className="flex shrink-0 items-center gap-2">{editActions}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
