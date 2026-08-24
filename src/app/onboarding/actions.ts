"use server";

import { redirect } from "next/navigation";
import { copyDefaultCategories } from "@/services/categories.service";
import { markOnboardingCompleted } from "@/services/profile.service";
import { updateAccount } from "@/services/accounts.service";

export async function completeOnboarding(formData: FormData) {
  const categoryIds = formData.getAll("categoryId").map(String);
  const subcategoryIds = formData.getAll("subcategoryId").map(String);
  const isFirstTime = String(formData.get("isFirstTime")) === "true";
  const redirectTo = String(formData.get("redirectTo") ?? "/dashboard");

  // categoryIds.length === 0 doesn't mean "nothing to do" — the user may have only added a
  // subcategory under a category they already imported (that category's checkbox is disabled,
  // so it never submits, but the new subcategory's checkbox isn't).
  const importedSomething = categoryIds.length > 0 || subcategoryIds.length > 0;
  if (importedSomething) {
    await copyDefaultCategories(categoryIds, subcategoryIds);
  }
  await markOnboardingCompleted();

  // First-time signup always continues to budget planning next (AI_CONTEXT.md "Onboarding —
  // conta padrão") — account confirmation now runs BEFORE this step, not after (reordered
  // 2026-08-24 at the user's request) — regardless of whether any category was actually picked
  // (the budget step degrades gracefully with nothing to show). A later re-import from Settings
  // never triggers this step, "se ele pular esta etapa não fazemos nada", per the user's own framing.
  redirect(isFirstTime ? "/onboarding/budget" : redirectTo);
}

export async function completeOnboardingAccount(accountId: string, balance: number) {
  await updateAccount(accountId, { type: "CASH", initialBalance: balance });
}
