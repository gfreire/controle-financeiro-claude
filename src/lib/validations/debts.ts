import { z } from "zod";

export const debtSideSchema = z.enum(["PAYABLE", "RECEIVABLE"]);

export const debtSchema = z.object({
  agent: z.string().min(1, "Nome é obrigatório").max(120),
  side: debtSideSchema,
  initialBalance: z.number(),
});
export type DebtInput = z.infer<typeof debtSchema>;

export const updateDebtSchema = debtSchema.partial().extend({ id: z.string().uuid() });

/** amount positive = debt increased; negative = payment reduced it. linked_transaction_id is optional either way. */
export const debtTransactionSchema = z.object({
  debtId: z.string().uuid(),
  date: z.string().min(1),
  amount: z.number().refine((v) => v !== 0, "O valor não pode ser zero"),
  description: z.string().max(500).optional().nullable(),
  createLinkedTransaction: z.boolean().optional(),
  linkedAccountId: z.string().uuid().optional().nullable(),
});
export type DebtTransactionInput = z.infer<typeof debtTransactionSchema>;
