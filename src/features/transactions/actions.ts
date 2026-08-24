"use server";

import { revalidatePath } from "next/cache";
import * as transactionsService from "@/services/transactions.service";
import { transactionSchema, updateTransactionSchema, refundTransactionSchema, type TransactionInput } from "@/lib/validations/transactions";

export async function createTransactionAction(input: TransactionInput) {
  const parsed = transactionSchema.parse(input);
  await transactionsService.createTransaction(parsed);
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/accounts");
}

export async function updateTransactionAction(input: { id: string } & Partial<TransactionInput>) {
  const { id, ...rest } = updateTransactionSchema.parse(input);
  await transactionsService.updateTransaction(id, rest);
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/accounts");
  revalidatePath("/budgets");
}

export async function deleteTransactionAction(id: string) {
  await transactionsService.deleteTransaction(id);
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/accounts");
}

export async function refundTransactionAction(input: { transactionId: string; refundDate: string }) {
  const parsed = refundTransactionSchema.parse(input);
  await transactionsService.refundTransaction(parsed.transactionId, parsed.refundDate);
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/accounts");
  revalidatePath("/budgets");
}
