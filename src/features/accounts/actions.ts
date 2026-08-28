"use server";

import { revalidatePath } from "next/cache";
import * as accountsService from "@/services/accounts.service";
import { accountSchema, updateAccountSchema, registerYieldSchema, reconcileBalanceSchema, registerInterestSchema, type AccountInput } from "@/lib/validations/accounts";

export async function createAccountAction(input: AccountInput) {
  const parsed = accountSchema.parse(input);
  await accountsService.createAccount(parsed);
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
}

export async function updateAccountAction(id: string, input: Partial<AccountInput>) {
  const parsed = updateAccountSchema.parse({ id, ...input });
  await accountsService.updateAccount(id, parsed);
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
}

export async function deactivateAccountAction(id: string) {
  await accountsService.deactivateAccount(id);
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
}

export async function registerYieldAction(accountId: string, realBalance: number) {
  const parsed = registerYieldSchema.parse({ accountId, realBalance });
  await accountsService.registerYield(parsed.accountId, parsed.realBalance);
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
}

export async function reconcileBalanceAction(accountId: string, realBalance: number) {
  const parsed = reconcileBalanceSchema.parse({ accountId, realBalance });
  await accountsService.reconcileAccountBalance(parsed.accountId, parsed.realBalance);
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
}

export async function registerInterestAction(input: { accountId: string; amount: number; date: string }) {
  const parsed = registerInterestSchema.parse(input);
  await accountsService.registerInterest(parsed);
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
  revalidatePath("/cards");
}
