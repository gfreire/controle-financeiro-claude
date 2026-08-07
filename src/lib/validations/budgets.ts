import { z } from "zod";

export const budgetSchema = z.object({
  categoryId: z.string().uuid(),
  subcategoryId: z.string().uuid().optional().nullable(),
  amount: z.number().positive("Valor deve ser maior que zero"),
});
export type BudgetInput = z.infer<typeof budgetSchema>;

export const updateBudgetSchema = budgetSchema.partial().extend({ id: z.string().uuid() });
