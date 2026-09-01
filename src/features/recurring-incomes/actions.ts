"use server";

import { revalidatePath } from "next/cache";
import * as recurringIncomesService from "@/services/recurring-incomes.service";
import {
  recurringIncomeSchema,
  updateRecurringIncomeSchema,
  registerReceiptSchema,
  type RecurringIncomeInput,
  type RegisterReceiptInput,
} from "@/lib/validations/recurring-incomes";

export async function createRecurringIncomeAction(input: RecurringIncomeInput) {
  const parsed = recurringIncomeSchema.parse(input);
  const id = await recurringIncomesService.createRecurringIncome(parsed);
  revalidatePath("/budgets");
  return id;
}

export async function updateRecurringIncomeAction(input: { id: string } & Partial<RecurringIncomeInput>) {
  const { id, ...rest } = updateRecurringIncomeSchema.parse(input);
  await recurringIncomesService.updateRecurringIncome(id, rest);
  revalidatePath("/budgets");
}

export async function deleteRecurringIncomeAction(id: string) {
  await recurringIncomesService.deactivateRecurringIncome(id);
  revalidatePath("/budgets");
}

export async function registerReceiptAction(input: RegisterReceiptInput) {
  const parsed = registerReceiptSchema.parse(input);
  await recurringIncomesService.registerReceipt(parsed);
  revalidatePath("/budgets");
  revalidatePath("/dashboard");
  revalidatePath("/accounts");
  revalidatePath("/transactions");
}

export async function cancelReceiptAction(recurringIncomeId: string, month: string) {
  await recurringIncomesService.cancelReceipt(recurringIncomeId, month);
  revalidatePath("/budgets");
  revalidatePath("/dashboard");
  revalidatePath("/accounts");
  revalidatePath("/transactions");
}
