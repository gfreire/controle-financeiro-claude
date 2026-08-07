"use server";

import { revalidatePath } from "next/cache";
import * as debtsService from "@/services/debts.service";
import { debtSchema, debtTransactionSchema, type DebtInput, type DebtTransactionInput } from "@/lib/validations/debts";

export async function createDebtAction(input: DebtInput) {
  const parsed = debtSchema.parse(input);
  await debtsService.createDebt(parsed);
  revalidatePath("/debts");
}

export async function addDebtTransactionAction(input: DebtTransactionInput) {
  const parsed = debtTransactionSchema.parse(input);
  await debtsService.addDebtTransaction(parsed);
  revalidatePath("/debts");
  revalidatePath("/dashboard");
  revalidatePath("/accounts");
}
