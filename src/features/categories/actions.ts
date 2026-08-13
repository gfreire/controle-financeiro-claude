"use server";

import { revalidatePath } from "next/cache";
import * as categoriesService from "@/services/categories.service";
import { categorySchema, updateCategorySchema, subcategorySchema, reassignCategorySchema, type CategoryInput, type SubcategoryInput } from "@/lib/validations/categories";

export async function createCategoryAction(input: CategoryInput) {
  const parsed = categorySchema.parse(input);
  const category = await categoriesService.createCategory(parsed);
  revalidatePath("/settings");
  return category;
}

export async function updateCategoryAction(input: { id: string; name?: string; color?: string; icon?: string | null }) {
  const { id, ...rest } = updateCategorySchema.parse(input);
  await categoriesService.updateCategory(id, rest);
  revalidatePath("/settings");
  revalidatePath("/dashboard");
}

export async function createSubcategoryAction(input: SubcategoryInput) {
  const parsed = subcategorySchema.parse(input);
  const subcategory = await categoriesService.createSubcategory(parsed);
  revalidatePath("/settings");
  return subcategory;
}

export async function getCategoryUsageAction(categoryId: string) {
  return categoriesService.getCategoryUsage(categoryId);
}

export async function getSubcategoryUsageAction(subcategoryId: string) {
  return categoriesService.getSubcategoryUsage(subcategoryId);
}

/** Guided deletion (AI_CONTEXT.md "Deleting a category or subcategory"): reassign every reference, only then delete. */
export async function deleteCategoryWithReassignmentAction(input: {
  categoryId: string;
  toCategoryId: string | null;
  toSubcategoryId?: string | null;
}) {
  const parsed = reassignCategorySchema.parse({ fromCategoryId: input.categoryId, toCategoryId: input.toCategoryId, toSubcategoryId: input.toSubcategoryId });
  await categoriesService.reassignCategory(parsed);
  await categoriesService.deleteCategory(input.categoryId);
  revalidatePath("/settings");
  revalidatePath("/dashboard");
}

export async function deleteSubcategoryWithReassignmentAction(input: {
  subcategoryId: string;
  toCategoryId: string | null;
  toSubcategoryId?: string | null;
}) {
  const parsed = reassignCategorySchema.parse({ fromSubcategoryId: input.subcategoryId, toCategoryId: input.toCategoryId, toSubcategoryId: input.toSubcategoryId });
  await categoriesService.reassignCategory(parsed);
  await categoriesService.deleteSubcategory(input.subcategoryId);
  revalidatePath("/settings");
  revalidatePath("/dashboard");
}
