import { z } from "zod";

export const budgetSchema = z.object({
  categoryId: z.string().uuid(),
  subcategoryId: z.string().uuid().optional().nullable(),
  amount: z.number().positive("Valor deve ser maior que zero"),
  // Any ISO date within the target month — normalized via startOfMonth() in the service. Immutable
  // after creation (like categoryId), so it's accepted here but never written by updateBudget.
  month: z.string(),
});
export type BudgetInput = z.infer<typeof budgetSchema>;

export const updateBudgetSchema = budgetSchema.partial().extend({ id: z.string().uuid() });
