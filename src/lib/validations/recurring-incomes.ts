import { z } from "zod";

// Base object kept separate from its refinement — zod can't .partial() a schema that already
// has .superRefine() applied (same convention as fixed-expenses.ts, see AGENTS.md).
const recurringIncomeBaseSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(120),
  amount: z.number().positive("Valor deve ser maior que zero"),
  dayOfMonth: z.number().int().min(1).max(28),
  defaultAccountId: z.string().uuid().optional().nullable(),
  // Must be an INCOME category — the server (createRecurringIncome) rejects a non-INCOME one,
  // same stance as categories.service#createSubcategory.
  categoryId: z.string().uuid().optional().nullable(),
  startCompetence: z.string().regex(/^\d{4}-\d{2}$/, "Início inválido"),
  endCompetence: z.string().regex(/^\d{4}-\d{2}$/, "Fim inválido").optional().nullable(),
});

export const recurringIncomeSchema = recurringIncomeBaseSchema.superRefine((data, ctx) => {
  if (data.endCompetence && data.endCompetence < data.startCompetence) {
    ctx.addIssue({ code: "custom", path: ["endCompetence"], message: "Fim não pode ser antes do início" });
  }
});
export type RecurringIncomeInput = z.infer<typeof recurringIncomeBaseSchema>;

export const updateRecurringIncomeSchema = recurringIncomeBaseSchema.partial().extend({ id: z.string().uuid() });

export const registerReceiptSchema = z.object({
  recurringIncomeId: z.string().uuid(),
  accountId: z.string().uuid(),
  amount: z.number().positive("Valor deve ser maior que zero"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  description: z.string().max(200).optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
});
export type RegisterReceiptInput = z.infer<typeof registerReceiptSchema>;
