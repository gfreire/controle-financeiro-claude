import { getAccounts } from "@/services/accounts.service";
import { getCategories } from "@/services/categories.service";
import { getCardInstallments, getCardPurchases, getCardSummary } from "@/services/cards.service";
import { Card, CardKicker, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils/currency";
import { startOfMonth, endOfMonth, monthKey, todayIso } from "@/lib/utils/date";
import { toPercentage } from "@/lib/utils/number";
import { PurchaseFormDialog } from "@/features/cards/components/purchase-form-dialog";
import { PaymentFormDialog } from "@/features/cards/components/payment-form-dialog";
import { DeletePurchaseButton } from "@/features/cards/components/delete-purchase-button";
import { MonthNav } from "@/features/cards/components/month-nav";
import { Button } from "@/components/ui/button";
import { CreditCard, Receipt, Pencil } from "lucide-react";

export default async function CardsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const month = resolvedSearchParams.month ?? monthKey(todayIso());

  const [accounts, categories] = await Promise.all([getAccounts(), getCategories()]);
  const cards = accounts.filter((a) => a.type === "CREDIT_CARD");
  const payerAccounts = accounts.filter((a) => a.type !== "CREDIT_CARD");

  const periodStart = startOfMonth(`${month}-01`);
  const periodEnd = endOfMonth(`${month}-01`);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-heading text-2xl font-semibold">Cartões</h1>
        <div className="flex items-center gap-2">
          <MonthNav />
          <PurchaseFormDialog cards={cards} categories={categories} />
        </div>
      </div>

      {cards.length === 0 ? (
        <p className="text-sm opacity-60">Nenhum cartão cadastrado. Crie um cartão de crédito na página de Contas.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {await Promise.all(
            cards.map(async (card) => {
              const currentMonth = monthKey(todayIso());
              const [installments, purchases, summary] = await Promise.all([
                getCardInstallments(card.id, { periodStart, periodEnd }),
                getCardPurchases(card.id),
                getCardSummary(card.id, currentMonth, card.creditLimit ?? null),
              ]);
              const purchaseById = new Map(purchases.map((p) => [p.id, p]));
              const usagePercent = summary.creditLimit ? toPercentage(summary.usedThroughCurrentMonth, summary.creditLimit) : null;

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
                          {formatCurrency(summary.usedThroughCurrentMonth)}
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
                        <span>Fatura deste mês: <strong className="tabular-nums">{formatCurrency(summary.currentMonthInvoice)}</strong></span>
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
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Descrição</TableHead>
                          <TableHead>Parcela</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                          <TableHead className="w-14" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {installments.map((r) => {
                          const purchase = purchaseById.get(r.purchaseId);
                          return (
                            <TableRow key={r.id}>
                              <TableCell>{r.description}</TableCell>
                              <TableCell className="text-xs opacity-70">{r.installmentNumber}/{r.totalInstallments}</TableCell>
                              <TableCell className="text-right tabular-nums">{formatCurrency(r.amount)}</TableCell>
                              <TableCell>
                                {purchase && (
                                  <div className="flex items-center gap-2">
                                    <PurchaseFormDialog
                                      cards={cards}
                                      categories={categories}
                                      purchase={purchase}
                                      trigger={
                                        <button className="text-text/40 hover:text-accent" aria-label="Editar compra">
                                          <Pencil className="size-3.5" strokeWidth={1.5} />
                                        </button>
                                      }
                                    />
                                    <DeletePurchaseButton purchaseId={purchase.id} description={purchase.description} />
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
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
