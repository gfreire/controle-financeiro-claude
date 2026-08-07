import { getBudgets } from "@/services/budgets.service";
import { getFixedExpenses } from "@/services/fixed-expenses.service";
import { getCategories } from "@/services/categories.service";
import { getAccounts } from "@/services/accounts.service";
import { todayIso } from "@/lib/utils/date";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils/currency";
import { toPercentage } from "@/lib/utils/number";
import { BudgetFormDialog } from "@/features/budgets/components/budget-form-dialog";
import { FixedExpenseFormDialog } from "@/features/budgets/components/fixed-expense-form-dialog";
import { PayFixedExpenseDialog } from "@/features/budgets/components/pay-fixed-expense-dialog";
import { CircleCheck, CreditCard } from "lucide-react";

export default async function BudgetsPage() {
  const month = todayIso();
  const [budgets, fixedExpenses, categories, accounts] = await Promise.all([
    getBudgets(month),
    getFixedExpenses(month),
    getCategories(),
    getAccounts(),
  ]);
  const liquidAccounts = accounts.filter((a) => a.type !== "CREDIT_CARD");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-2xl font-semibold">Orçamentos e despesas fixas</h1>

      <Tabs defaultValue="budgets">
        <TabsList>
          <TabsTrigger value="budgets">Orçamentos</TabsTrigger>
          <TabsTrigger value="fixed">Despesas fixas</TabsTrigger>
        </TabsList>

        <TabsContent value="budgets" className="flex flex-col gap-3">
          <div className="flex justify-end"><BudgetFormDialog categories={categories} /></div>
          {budgets.length === 0 ? (
            <p className="text-sm opacity-60">Nenhum orçamento definido ainda.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {budgets.map((b) => (
                <Card key={b.id} elevation="sm">
                  <CardTitle>{b.categoryName}{b.subcategoryName ? ` · ${b.subcategoryName}` : ""}</CardTitle>
                  <div className="flex items-center justify-between text-sm">
                    <span className="tabular-nums opacity-80">{formatCurrency(b.actualAmount)} / {formatCurrency(b.plannedAmount)}</span>
                    {b.status === "EXCEEDED" && <Badge variant="danger">Estourou</Badge>}
                  </div>
                  <div className="h-1.5 w-full bg-neutral-200">
                    <div className={b.status === "EXCEEDED" ? "h-full bg-danger-500" : "h-full bg-accent"} style={{ width: `${toPercentage(b.actualAmount, b.plannedAmount)}%` }} />
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="fixed" className="flex flex-col gap-3">
          <div className="flex justify-end"><FixedExpenseFormDialog categories={categories} accounts={liquidAccounts} /></div>
          {fixedExpenses.length === 0 ? (
            <p className="text-sm opacity-60">Nenhuma despesa fixa cadastrada ainda.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {fixedExpenses.map((f) => (
                <Card key={f.id} elevation="sm" className="gap-2">
                  <div className="flex items-center justify-between">
                    <CardTitle>{f.name}</CardTitle>
                    {f.isPaidThisMonth ? (
                      <Badge variant="success" className="gap-1"><CircleCheck className="size-3" strokeWidth={1.5} /> Pago</Badge>
                    ) : (
                      <Badge variant="neutral">Vence dia {f.dueDay}</Badge>
                    )}
                  </div>
                  <div className="text-lg font-semibold tabular-nums">{formatCurrency(f.projectedAmount)}</div>
                  {f.status === "EXCEEDED" && <Badge variant="danger" className="w-fit">Acima do planejado</Badge>}
                  {!f.isPaidThisMonth && (
                    <PayFixedExpenseDialog
                      expense={f}
                      accounts={liquidAccounts}
                      trigger={<Button size="sm" variant="secondary" className="w-fit"><CreditCard className="size-3.5" strokeWidth={1.5} /> Registrar pagamento</Button>}
                    />
                  )}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
