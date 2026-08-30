"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { chartTooltipStyle } from "@/components/ui/chart-tooltip";
import { formatCurrency } from "@/lib/utils/currency";
import { formatMonthLabel, daysUntilDueThisMonth, monthKey, todayIso } from "@/lib/utils/date";
import { PaymentFormDialog } from "@/features/cards/components/payment-form-dialog";
import { PayFixedExpenseDialog } from "@/features/budgets/components/pay-fixed-expense-dialog";
import { DebtTransactionDialog } from "@/features/debts/components/debt-transaction-dialog";
import type {
  AccountDTO,
  CategoryDTO,
  DebtDTO,
  FixedExpenseDTO,
  MonthObligationItemDTO,
  MonthObligationsDTO,
} from "@/types/dto";

/**
 * "Despesas de {mês}" — the viewed month's spending as a donut: "Pago" slice (everything already
 * settled) + one slice per still-open commitment (faturas de cartão by competence, despesas
 * programadas, dívidas OVERDUE_BILL/INSTALLMENT_PLAN), each with a one-click payment trigger.
 * Follows the dashboard's period filter (`data.month`), not today's month. Replaces the old
 * "Vence essa semana" alert. See AI_CONTEXT.md "Despesas do mês (dashboard)".
 *
 * The donut carries the "Pago" slice and `total` in the centre (like every other donut in the
 * app); the list below is only the unpaid items (each = one slice). The donut keeps the
 * service's order (by amount); the list is re-ordered here by due date. Aggregation is all in
 * `getCurrentMonthObligations` (Chart Rules — no reduce() here).
 */

const SLICE_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#14b8a6",
  "#6366f1",
  "#ef4444",
  "#84cc16",
  "#06b6d4",
  "#a855f7",
];
const PAID_COLOR = "var(--color-success-600)";

function DueBadge({ dueDay, month }: { dueDay?: number; month: string }) {
  if (dueDay === undefined) return <Badge variant="danger">Atrasada</Badge>;
  // The day-countdown only makes sense for today's real month. When the card is browsing a
  // different month, fall back to a plain past/future indicator.
  const todayMonth = monthKey(todayIso());
  if (month > todayMonth) return <Badge variant="warning">Vence dia {dueDay}</Badge>;
  if (month < todayMonth) return <Badge variant="danger">Atrasada</Badge>;
  const days = daysUntilDueThisMonth(dueDay, todayIso());
  if (days < 0) return <Badge variant="danger">Atrasada há {Math.abs(days)}d</Badge>;
  if (days === 0) return <Badge variant="warning">Vence hoje</Badge>;
  return <Badge variant="warning">Vence em {days}d</Badge>;
}

export function MonthObligationsCard({
  data,
  accounts,
  categories,
  fixedExpenses,
  debts,
}: {
  data: MonthObligationsDTO;
  accounts: AccountDTO[];
  categories: CategoryDTO[];
  fixedExpenses: FixedExpenseDTO[];
  debts: DebtDTO[];
}) {
  if (data.total <= 0) return null;

  const payerAccounts = accounts.filter((a) => a.type !== "CREDIT_CARD");
  const cardById = new Map(accounts.filter((a) => a.type === "CREDIT_CARD").map((c) => [c.id, c]));
  const fixedById = new Map(fixedExpenses.map((f) => [f.id, f]));
  const debtById = new Map(debts.map((d) => [d.id, d]));

  // The donut keeps the service's order (by amount, desc); each item's colour is fixed by that
  // order so the list swatch below matches its slice.
  const colorByItemId = new Map(data.items.map((item, i) => [item.id, SLICE_COLORS[i % SLICE_COLORS.length]]));

  const slices = [
    ...data.items.map((item) => ({
      key: item.id,
      name: item.description,
      value: item.amount,
      color: colorByItemId.get(item.id)!,
    })),
    ...(data.paidTotal > 0 ? [{ key: "__paid__", name: "Pago", value: data.paidTotal, color: PAID_COLOR }] : []),
  ];

  // The list is ordered by due date instead: overdue bills (no dueDay) first, then ascending
  // dueDay. Same items as the donut, just a different reading order.
  const listItems = [...data.items].sort((a, b) => {
    if (a.dueDay === undefined && b.dueDay === undefined) return 0;
    if (a.dueDay === undefined) return -1;
    if (b.dueDay === undefined) return 1;
    return a.dueDay - b.dueDay;
  });

  function renderAction(item: MonthObligationItemDTO) {
    const trigger = (
      <Button variant="ghost" size="sm" className="h-auto px-2 py-1 text-xs">
        Pagar
      </Button>
    );
    if (item.kind === "CARD") {
      const card = cardById.get(item.id);
      if (!card) return null;
      return <PaymentFormDialog card={card} payerAccounts={payerAccounts} statementBalance={item.amount} trigger={trigger} />;
    }
    if (item.kind === "FIXED_EXPENSE") {
      const expense = fixedById.get(item.id);
      if (!expense) return null;
      return <PayFixedExpenseDialog expense={expense} accounts={accounts} month={data.month} trigger={trigger} />;
    }
    const debt = debtById.get(item.id);
    if (!debt) return null;
    return (
      <DebtTransactionDialog
        debtId={debt.id}
        debtName={debt.agent}
        debtSide={debt.side}
        currentBalance={debt.remainingBalance}
        mode="payment"
        accounts={payerAccounts}
        categories={categories}
        defaultCategoryId={debt.defaultCategoryId}
        defaultAmount={item.amount}
        trigger={trigger}
      />
    );
  }

  return (
    <Card elevation="sm" className="gap-3">
      <CardTitle>Despesas de {formatMonthLabel(data.month)}</CardTitle>

      <div className="relative h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} dataKey="value" nameKey="name" innerRadius="60%" outerRadius="85%" paddingAngle={1}>
              {slices.map((s) => (
                <Cell key={s.key} fill={s.color} stroke="var(--color-bg)" strokeWidth={1} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => formatCurrency(Number(value))} {...chartTooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-semibold tabular-nums">{formatCurrency(data.total)}</span>
          <span className="text-[11px] opacity-60">
            {data.remainingTotal > 0 ? `${formatCurrency(data.remainingTotal)} a pagar` : "total"}
          </span>
        </div>
      </div>

      {data.items.length === 0 ? (
        <p className="text-sm opacity-60">Tudo pago neste mês.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {listItems.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 shrink-0" style={{ background: colorByItemId.get(item.id) }} />
                {item.description}
              </span>
              <span className="flex items-center gap-2">
                <span className="font-medium tabular-nums">{formatCurrency(item.amount)}</span>
                <DueBadge dueDay={item.dueDay} month={data.month} />
                {renderAction(item)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
