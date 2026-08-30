"use client";

import { useState } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";
import { textIncludes } from "@/lib/utils/normalize";
import { EditableCategoryCell } from "./editable-category-cell";
import { DeleteTransactionButton } from "@/features/transactions/components/delete-transaction-button";
import { TransactionFormDialog } from "@/features/transactions/components/transaction-form-dialog";
import { RefundTransactionDialog } from "@/features/transactions/components/refund-transaction-dialog";
import { AccountTypeIcon } from "@/components/ui/account-type-icon";
import type { AccountDTO, CategoryDTO, TransactionViewDTO } from "@/types/dto";

export function TransactionExplorer({
  transactions,
  categories,
  accounts,
}: {
  transactions: TransactionViewDTO[];
  categories: CategoryDTO[];
  /** Optional — needed only to power the full-edit dialog (amount/date/description/account) on `source: "transaction"` rows. Omit where accounts aren't already loaded and only inline category editing is needed. */
  accounts?: AccountDTO[];
}) {
  const [search, setSearch] = useState("");
  const filtered = search ? transactions.filter((t) => textIncludes(`${t.description} ${t.category} ${t.account}`, search)) : transactions;

  return (
    <Card elevation="sm" className="gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>Movimentações ({filtered.length})</CardTitle>
        <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 w-40" />
      </div>

      {/* Mobile: a 6-column table (data/descrição/categoria/conta/valor/ações) never fits a
          phone screen — it forced a horizontal scroll inside a page that already scrolls
          vertically, which testing found most people never discover. Below `sm:` each row
          becomes a stacked card instead, mirroring the pattern already proven on the Cards
          page's installment list (line 1: data/descrição, valor, ações · line 2: categoria). */}
      <div className="flex flex-col divide-y divide-text/[0.08] sm:hidden">
        {filtered.map((t) => {
          // RESERVE/REDEEM (aporte/resgate de Meta) são geridos só pela tela de Metas — read-only aqui.
          const isGoalMovement = t.type === "RESERVE" || t.type === "REDEEM";
          const inflow = t.type === "INCOME" || t.type === "REDEEM";
          const actions =
            t.source === "transaction" && !isGoalMovement ? (
              <div className="flex shrink-0 items-center gap-1">
                {accounts && t.type !== "CREDIT_CARD_PAYMENT" && (
                  <TransactionFormDialog accounts={accounts} categories={categories} transaction={t} />
                )}
                {t.type === "EXPENSE" && t.category !== "Estorno" && (
                  <RefundTransactionDialog transactionId={t.id} description={t.description} amount={t.amount} />
                )}
                <DeleteTransactionButton transactionId={t.id} description={t.description} />
              </div>
            ) : (
              <span className="shrink-0 self-center text-[10px] opacity-40" title={isGoalMovement ? "Edite ou exclua pela tela de Metas" : "Edite ou exclua pela tela de Cartões"}>—</span>
            );
          return (
            <div key={`${t.source}-${t.id}`} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    <span className="tabular-nums opacity-60">{formatDate(t.date)}</span>{" "}
                    {t.description || <span className="opacity-40">Sem descrição</span>}
                  </p>
                  <p className="flex flex-wrap items-center gap-1.5 text-xs opacity-60">
                    {t.account && (
                      <span className="inline-flex items-center gap-1">
                        {t.accountType && <AccountTypeIcon type={t.accountType} className="size-3" />}
                        {t.account}
                      </span>
                    )}
                    {t.source === "installment" && <Badge variant="neutral">cartão</Badge>}
                    {t.paidBeforeSystem && <Badge variant="outline">paga antes do sistema</Badge>}
                    {t.type === "EXPENSE" && t.category === "Estorno" && <Badge variant="accent">estornado</Badge>}
                  </p>
                </div>
                <span className={`shrink-0 text-sm font-medium tabular-nums ${inflow ? "text-success-600" : "text-danger-600"}`}>
                  {inflow ? "+" : "-"}
                  {formatCurrency(t.amount)}
                </span>
                {actions}
              </div>
              <EditableCategoryCell row={t} categories={categories} layout="row" />
            </div>
          );
        })}
        {filtered.length === 0 && <p className="py-8 text-center text-sm opacity-50">Nenhum lançamento encontrado.</p>}
      </div>

      {/* Tablet/desktop: the original table, with room for every column on one line. */}
      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Conta</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((t) => (
              <TableRow key={`${t.source}-${t.id}`}>
                <TableCell className="whitespace-nowrap text-xs opacity-70">{formatDate(t.date)}</TableCell>
                <TableCell className="max-w-[220px] truncate">
                  {t.description || <span className="opacity-40">Sem descrição</span>}
                  {t.source === "installment" && (
                    <Badge variant="neutral" className="ml-2">cartão</Badge>
                  )}
                  {t.paidBeforeSystem && (
                    <Badge variant="outline" className="ml-2">paga antes do sistema</Badge>
                  )}
                  {t.type === "EXPENSE" && t.category === "Estorno" && (
                    <Badge variant="accent" className="ml-2">estornado</Badge>
                  )}
                </TableCell>
                <TableCell><EditableCategoryCell row={t} categories={categories} /></TableCell>
                <TableCell className="whitespace-nowrap text-xs opacity-70">
                  {t.account && (
                    <span className="inline-flex items-center gap-1">
                      {t.accountType && <AccountTypeIcon type={t.accountType} className="size-3" />}
                      {t.account}
                    </span>
                  )}
                </TableCell>
                <TableCell className={`text-right tabular-nums font-medium ${t.type === "INCOME" || t.type === "REDEEM" ? "text-success-600" : "text-danger-600"}`}>
                  {t.type === "INCOME" || t.type === "REDEEM" ? "+" : "-"}
                  {formatCurrency(t.amount)}
                </TableCell>
                <TableCell>
                  {t.source === "transaction" && t.type !== "RESERVE" && t.type !== "REDEEM" ? (
                    <div className="flex items-center gap-1">
                      {accounts && t.type !== "CREDIT_CARD_PAYMENT" && (
                        <TransactionFormDialog accounts={accounts} categories={categories} transaction={t} />
                      )}
                      {t.type === "EXPENSE" && t.category !== "Estorno" && (
                        <RefundTransactionDialog transactionId={t.id} description={t.description} amount={t.amount} />
                      )}
                      <DeleteTransactionButton transactionId={t.id} description={t.description} />
                    </div>
                  ) : (
                    <span className="text-[10px] opacity-40" title={t.type === "RESERVE" || t.type === "REDEEM" ? "Edite ou exclua pela tela de Metas" : "Edite ou exclua pela tela de Cartões"}>—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm opacity-50">
                  Nenhum lançamento encontrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
