import { z } from "zod";

export const reservoirSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(120),
  categoryId: z.string().uuid().optional().nullable(),
  subcategoryId: z.string().uuid().optional().nullable(),
  // Pré-preenchem AccrualDialog/WithdrawalDialog — ver AI_CONTEXT.md "Reservoir (Cofre)".
  defaultPercentage: z.number().min(0).max(100).optional().nullable(),
  defaultDestinationAccountId: z.string().uuid().optional().nullable(),
});
export type ReservoirInput = z.infer<typeof reservoirSchema>;

export const updateReservoirSchema = reservoirSchema.partial().extend({ id: z.string().uuid() });
export type UpdateReservoirInput = z.infer<typeof updateReservoirSchema>;

/** Accrual entry: amount positive. grossAmount is always a direct user input, never derived. */
export const reservoirAccrualSchema = z
  .object({
    reservoirId: z.string().uuid(),
    date: z.string().min(1),
    amount: z.number().positive("Valor deve ser maior que zero"),
    grossAmount: z.number().positive().optional(),
    percentage: z.number().min(0).max(100).optional(),
    description: z.string().max(500).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.grossAmount !== undefined && data.grossAmount < data.amount) {
      ctx.addIssue({ code: "custom", path: ["grossAmount"], message: "O valor bruto não pode ser menor que o valor líquido" });
    }
  });
export type ReservoirAccrualInput = z.infer<typeof reservoirAccrualSchema>;

/** Edits an existing accrual entry — never a withdrawal, which stays linked to its transaction. */
export const updateReservoirAccrualSchema = z
  .object({
    id: z.string().uuid(),
    date: z.string().min(1),
    amount: z.number().positive("Valor deve ser maior que zero"),
    grossAmount: z.number().positive().optional().nullable(),
    percentage: z.number().min(0).max(100).optional().nullable(),
    description: z.string().max(500).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.grossAmount !== undefined && data.grossAmount !== null && data.grossAmount < data.amount) {
      ctx.addIssue({ code: "custom", path: ["grossAmount"], message: "O valor bruto não pode ser menor que o valor líquido" });
    }
  });
export type UpdateReservoirAccrualInput = z.infer<typeof updateReservoirAccrualSchema>;

export const reservoirWithdrawalSchema = z.object({
  reservoirId: z.string().uuid(),
  date: z.string().min(1),
  amount: z.number().positive("Valor deve ser maior que zero"),
  description: z.string().max(500).optional().nullable(),
  destinationAccountId: z.string().uuid(),
  categoryId: z.string().uuid().optional().nullable(),
  subcategoryId: z.string().uuid().optional().nullable(),
});
export type ReservoirWithdrawalInput = z.infer<typeof reservoirWithdrawalSchema>;
