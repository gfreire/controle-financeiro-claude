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

// The three `debts.kind` values each have their own screen since 2026-08-29 — any debt mutation
// can affect whichever one is being viewed, so revalidate all three.
const DEBT_PATHS = ["/debts", "/overdue-bills", "/installment-plans"] as const;
function revalidateDebtPaths() {
  for (const p of DEBT_PATHS) revalidatePath(p);
}

export async function createDebtAction(input: DebtInput) {
  const parsed = debtSchema.parse(input);
  await debtsService.createDebt(parsed);
  revalidateDebtPaths();
}

export async function updateDebtAction(input: UpdateDebtInput) {
  const { id, ...rest } = updateDebtSchema.parse(input);
  await debtsService.updateDebt(id, rest);
  revalidateDebtPaths();
}

export async function addDebtTransactionAction(input: DebtTransactionInput) {
  const parsed = debtTransactionSchema.parse(input);
  const result = await debtsService.addDebtTransaction(parsed);
  revalidateDebtPaths();
  revalidatePath("/dashboard");
  revalidatePath("/accounts");
  return result;
}

export async function updateDebtTransactionAction(input: UpdateDebtTransactionInput) {
  const parsed = updateDebtTransactionSchema.parse(input);
  const result = await debtsService.updateDebtTransaction(parsed);
  revalidateDebtPaths();
  revalidatePath("/dashboard");
  revalidatePath("/accounts");
  return result;
}

export async function deleteDebtTransactionAction(id: string) {
  await debtsService.deleteDebtTransaction(id);
  revalidateDebtPaths();
  revalidatePath("/dashboard");
  revalidatePath("/accounts");
}

export async function deactivateDebtAction(id: string) {
  await debtsService.deactivateDebt(id);
  revalidateDebtPaths();
}
