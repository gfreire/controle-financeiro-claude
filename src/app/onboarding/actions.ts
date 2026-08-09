"use server";

import { redirect } from "next/navigation";
import { copyDefaultCategories } from "@/services/categories.service";
import { markOnboardingCompleted } from "@/services/profile.service";

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

  // First-time signup with at least one category picked: go straight to planning this month's
  // budget (AI_CONTEXT.md "Budgets") instead of the dashboard. Skipping category selection
  // entirely, or a later re-import from Settings, never triggers this — "se ele pular esta
  // etapa não fazemos nada", per the user's own framing.
  redirect(isFirstTime && importedSomething ? "/onboarding/budget" : redirectTo);
}
