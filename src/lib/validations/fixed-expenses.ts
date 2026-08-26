import { z } from "zod";

// Base object kept separate from its refinement — zod can't .partial() a schema that already
// has .superRefine() applied (see AGENTS.md's note on this project convention).
const fixedExpenseBaseSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(120),
  amount: z.number().positive("Valor deve ser maior que zero"),
  categoryId: z.string().uuid().optional().nullable(),
  subcategoryId: z.string().uuid().optional().nullable(),
  defaultAccountId: z.string().uuid().optional().nullable(),
  dueDay: z.number().int().min(1).max(31),
  startCompetence: z.string().regex(/^\d{4}-\d{2}$/, "Início inválido"),
  endCompetence: z.string().regex(/^\d{4}-\d{2}$/, "Fim inválido").optional().nullable(),
});

export const fixedExpenseSchema = fixedExpenseBaseSchema.superRefine((data, ctx) => {
  if (data.endCompetence && data.endCompetence < data.startCompetence) {
    ctx.addIssue({ code: "custom", path: ["endCompetence"], message: "Fim não pode ser antes do início" });
  }
});
export type FixedExpenseInput = z.infer<typeof fixedExpenseBaseSchema>;

export const updateFixedExpenseSchema = fixedExpenseBaseSchema.partial().extend({ id: z.string().uuid() });
