import { z } from "zod";

export const fixedExpenseSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(120),
  amount: z.number().positive("Valor deve ser maior que zero"),
  categoryId: z.string().uuid().optional().nullable(),
  subcategoryId: z.string().uuid().optional().nullable(),
  defaultAccountId: z.string().uuid().optional().nullable(),
  dueDay: z.number().int().min(1).max(31),
});
export type FixedExpenseInput = z.infer<typeof fixedExpenseSchema>;

export const updateFixedExpenseSchema = fixedExpenseSchema.partial().extend({ id: z.string().uuid() });
