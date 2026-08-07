import { z } from "zod";

export const categoryTypeSchema = z.enum(["INCOME", "EXPENSE"]);

export const categorySchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(80),
  type: categoryTypeSchema,
  color: z.string().min(1),
  icon: z.string().max(8).optional().nullable(),
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const updateCategorySchema = categorySchema.partial().extend({ id: z.string().uuid() });

export const subcategorySchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().min(1, "Nome é obrigatório").max(80),
});
export type SubcategoryInput = z.infer<typeof subcategorySchema>;

export const updateSubcategorySchema = subcategorySchema.partial().extend({ id: z.string().uuid() });

/**
 * Reassign or clear category/subcategory for every referencing row — the only path a delete may
 * follow, and also reused directly from the dashboard to batch-fix uncategorized/miscategorized
 * entries (see ARCHITECTURE.md "Dashboard Philosophy"). `fromUncategorized: true` targets rows
 * where category_id IS NULL instead of a specific category.
 */
export const reassignCategorySchema = z.object({
  fromCategoryId: z.string().uuid().optional(),
  fromSubcategoryId: z.string().uuid().optional(),
  fromUncategorized: z.boolean().optional(),
  toCategoryId: z.string().uuid().nullable(),
  toSubcategoryId: z.string().uuid().nullable().optional(),
});
export type ReassignCategoryInput = z.infer<typeof reassignCategorySchema>;
