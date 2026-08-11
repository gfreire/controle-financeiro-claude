"use server";

import { revalidatePath } from "next/cache";
import * as debtsService from "@/services/debts.service";
import {
  debtSchema,
  updateDebtSchema,
  debtTransactionSchema,
  updateDebtTransactionSchema,
  type DebtInput,
  type UpdateDebtInput,
  type DebtTransactionInput,
  type UpdateDebtTransactionInput,
} from "@/lib/validations/debts";

export async function createDebtAction(input: DebtInput) {
  const parsed = debtSchema.parse(input);
  await debtsService.createDebt(parsed);
  revalidatePath("/debts");
}

export async function updateDebtAction(input: UpdateDebtInput) {
  const { id, ...rest } = updateDebtSchema.parse(input);
  await debtsService.updateDebt(id, rest);
  revalidatePath("/debts");
}

export async function addDebtTransactionAction(input: DebtTransactionInput) {
  const parsed = debtTransactionSchema.parse(input);
  const result = await debtsService.addDebtTransaction(parsed);
  revalidatePath("/debts");
  revalidatePath("/dashboard");
  revalidatePath("/accounts");
  return result;
}

export async function updateDebtTransactionAction(input: UpdateDebtTransactionInput) {
  const parsed = updateDebtTransactionSchema.parse(input);
  const result = await debtsService.updateDebtTransaction(parsed);
  revalidatePath("/debts");
  revalidatePath("/dashboard");
  revalidatePath("/accounts");
  return result;
}

export async function deleteDebtTransactionAction(id: string) {
  await debtsService.deleteDebtTransaction(id);
  revalidatePath("/debts");
  revalidatePath("/dashboard");
  revalidatePath("/accounts");
}

export async function deactivateDebtAction(id: string) {
  await debtsService.deactivateDebt(id);
  revalidatePath("/debts");
}
