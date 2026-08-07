"use server";

import { revalidatePath } from "next/cache";
import * as transactionsService from "@/services/transactions.service";
import { transactionSchema, type TransactionInput } from "@/lib/validations/transactions";

export async function createTransactionAction(input: TransactionInput) {
  const parsed = transactionSchema.parse(input);
  await transactionsService.createTransaction(parsed);
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/accounts");
}

export async function deleteTransactionAction(id: string) {
  await transactionsService.deleteTransaction(id);
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/accounts");
}
