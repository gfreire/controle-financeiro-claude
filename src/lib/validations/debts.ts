import { z } from "zod";

export const debtSideSchema = z.enum(["PAYABLE", "RECEIVABLE"]);

export const debtSchema = z.object({
  agent: z.string().min(1, "Nome é obrigatório").max(120),
  side: debtSideSchema,
  initialBalance: z.number(),
  defaultCategoryId: z.string().uuid().optional().nullable(),
});
export type DebtInput = z.infer<typeof debtSchema>;

export const updateDebtSchema = debtSchema.partial().extend({ id: z.string().uuid() });
export type UpdateDebtInput = z.infer<typeof updateDebtSchema>;

/** amount positive = debt increased; negative = payment reduced it. linked_transaction_id is optional either way. */
export const debtTransactionSchema = z.object({
  debtId: z.string().uuid(),
  date: z.string().min(1),
  amount: z.number().refine((v) => v !== 0, "O valor não pode ser zero"),
  description: z.string().max(500).optional().nullable(),
  createLinkedTransaction: z.boolean().optional(),
  linkedAccountId: z.string().uuid().optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
});
export type DebtTransactionInput = z.infer<typeof debtTransactionSchema>;

/**
 * Editing a debt transaction never flips its direction (increase vs payment) — `amount`'s sign
 * must match the original entry (enforced in debts.service.ts#updateDebtTransaction, not just
 * here, since that requires reading the existing row). `categoryId` only has anywhere to persist
 * when the entry has a linked `transactions` row; the service ignores it otherwise.
 */
export const updateDebtTransactionSchema = z.object({
  id: z.string().uuid(),
  date: z.string().min(1),
  amount: z.number().refine((v) => v !== 0, "O valor não pode ser zero"),
  description: z.string().max(500).optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
});
export type UpdateDebtTransactionInput = z.infer<typeof updateDebtTransactionSchema>;
