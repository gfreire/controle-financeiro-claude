"use server";

import { redirect } from "next/navigation";
import { copyDefaultCategories } from "@/services/categories.service";
import { markOnboardingCompleted } from "@/services/profile.service";

export async function completeOnboarding(formData: FormData) {
  const categoryIds = formData.getAll("categoryId").map(String);
  const subcategoryIds = formData.getAll("subcategoryId").map(String);
  const redirectTo = String(formData.get("redirectTo") ?? "/dashboard");

  if (categoryIds.length) {
    await copyDefaultCategories(categoryIds, subcategoryIds);
  }
  await markOnboardingCompleted();

  redirect(redirectTo);
}
