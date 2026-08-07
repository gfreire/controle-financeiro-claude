"use server";

import { revalidatePath } from "next/cache";
import * as budgetsService from "@/services/budgets.service";
import * as fixedExpensesService from "@/services/fixed-expenses.service";
import { budgetSchema, type BudgetInput } from "@/lib/validations/budgets";
import { fixedExpenseSchema, type FixedExpenseInput } from "@/lib/validations/fixed-expenses";
import { createTransaction } from "@/services/transactions.service";

export async function createBudgetAction(input: BudgetInput) {
  const parsed = budgetSchema.parse(input);
  await budgetsService.createBudget(parsed);
  revalidatePath("/budgets");
  revalidatePath("/dashboard");
}

export async function createFixedExpenseAction(input: FixedExpenseInput) {
  const parsed = fixedExpenseSchema.parse(input);
  await fixedExpensesService.createFixedExpense(parsed);
  revalidatePath("/budgets");
  revalidatePath("/dashboard");
}

/** Registers the real payment for a fixed expense, linked via fixed_expense_id — switches its projectedAmount from planned to actual. */
export async function payFixedExpenseAction(input: {
  fixedExpenseId: string;
  originAccountId: string;
  amount: number;
  date: string;
  categoryId?: string | null;
  subcategoryId?: string | null;
}) {
  await createTransaction({
    type: "EXPENSE",
    originAccountId: input.originAccountId,
    amount: input.amount,
    date: input.date,
    categoryId: input.categoryId ?? undefined,
    subcategoryId: input.subcategoryId ?? undefined,
    fixedExpenseId: input.fixedExpenseId,
  });
  revalidatePath("/budgets");
  revalidatePath("/dashboard");
  revalidatePath("/accounts");
}
