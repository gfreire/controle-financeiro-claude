"use server";

import { revalidatePath } from "next/cache";
import * as budgetsService from "@/services/budgets.service";
import * as fixedExpensesService from "@/services/fixed-expenses.service";
import { budgetSchema, updateBudgetSchema, type BudgetInput } from "@/lib/validations/budgets";
import { fixedExpenseSchema, updateFixedExpenseSchema, type FixedExpenseInput } from "@/lib/validations/fixed-expenses";

export async function getBudgetFloorAction(categoryId: string, subcategoryId: string | undefined, month: string) {
  return budgetsService.getBudgetFloor(categoryId, subcategoryId ?? null, month);
}

export async function createBudgetAction(input: BudgetInput) {
  const parsed = budgetSchema.parse(input);
  const result = await budgetsService.createBudget(parsed);
  revalidatePath("/budgets");
  revalidatePath("/dashboard");
  return result;
}

export async function updateBudgetAction(input: { id: string } & Partial<BudgetInput>) {
  const { id, ...rest } = updateBudgetSchema.parse(input);
  const result = await budgetsService.updateBudget(id, rest);
  revalidatePath("/budgets");
  revalidatePath("/dashboard");
  return result;
}

export async function createFixedExpenseAction(input: FixedExpenseInput) {
  const parsed = fixedExpenseSchema.parse(input);
  const result = await fixedExpensesService.createFixedExpense(parsed);
  revalidatePath("/budgets");
  revalidatePath("/dashboard");
  return result;
}

export async function updateFixedExpenseAction(input: { id: string } & Partial<FixedExpenseInput>) {
  const { id, ...rest } = updateFixedExpenseSchema.parse(input);
  const result = await fixedExpensesService.updateFixedExpense(id, rest);
  revalidatePath("/budgets");
  revalidatePath("/dashboard");
  return result;
}

export async function deactivateBudgetAction(id: string) {
  await budgetsService.deactivateBudget(id);
  revalidatePath("/budgets");
  revalidatePath("/dashboard");
}

export async function cloneBudgetMonthAction(fromMonth: string, toMonth: string) {
  const result = await budgetsService.cloneBudgetMonth(fromMonth, toMonth);
  revalidatePath("/budgets");
  revalidatePath("/dashboard");
  return result;
}

export async function deleteFixedExpenseAction(id: string) {
  await fixedExpensesService.deleteFixedExpense(id);
  revalidatePath("/budgets");
  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  revalidatePath("/cards");
}

export async function payFixedExpenseAction(input: {
  fixedExpenseId: string;
  originAccountId: string;
  amount: number;
  date: string;
  description?: string;
  categoryId?: string | null;
  subcategoryId?: string | null;
}) {
  await fixedExpensesService.payFixedExpense(input);
  revalidatePath("/budgets");
  revalidatePath("/dashboard");
  revalidatePath("/accounts");
  revalidatePath("/cards");
}

export async function cancelFixedExpensePaymentAction(fixedExpenseId: string, month: string) {
  await fixedExpensesService.cancelFixedExpensePayment(fixedExpenseId, month);
  revalidatePath("/budgets");
  revalidatePath("/dashboard");
  revalidatePath("/accounts");
  revalidatePath("/cards");
}

export async function getUnlinkedExpenseCandidatesAction(categoryId: string | null) {
  return fixedExpensesService.getUnlinkedExpenseCandidates(categoryId);
}

export async function linkExistingTransactionAction(fixedExpenseId: string, id: string, source: "transaction" | "purchase") {
  await fixedExpensesService.linkExistingTransaction(fixedExpenseId, id, source);
  revalidatePath("/budgets");
  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  revalidatePath("/cards");
}
