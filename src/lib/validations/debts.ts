import { z } from "zod";

export const debtSideSchema = z.enum(["PAYABLE", "RECEIVABLE"]);

/**
 * PERSONAL: empréstimo entre pessoas (comportamento original — nunca afeta o dashboard).
 * OVERDUE_BILL: conta em atraso (água/luz/telefone/aluguel) — sempre PAYABLE na prática, sempre
 * aparece com alerta e conta pra "Dívidas em aberto" do dashboard.
 * INSTALLMENT_PLAN: parcelamento programado (boleto ou acordo informal com valor mensal) — mesma
 * exposição no dashboard de OVERDUE_BILL, mais um lembrete mensal (monthlyAmount/dueDay).
 * Ver AI_CONTEXT.md "Dívidas — subtipos".
 */
export const debtKindSchema = z.enum(["PERSONAL", "OVERDUE_BILL", "INSTALLMENT_PLAN"]);

// Base object kept separate from its refinement — zod can't .partial() a schema that already has
// a .superRefine()/.refine() on it, and updateDebtSchema below needs to.
const debtBaseSchema = z.object({
  agent: z.string().min(1, "Nome é obrigatório").max(120),
  side: debtSideSchema,
  kind: debtKindSchema,
  initialBalance: z.number(),
  defaultCategoryId: z.string().uuid().optional().nullable(),
  // INSTALLMENT_PLAN-only — obrigatórios nesse caso, ver superRefine abaixo.
  monthlyAmount: z.number().positive().optional().nullable(),
  dueDay: z.number().int().min(1).max(28).optional().nullable(),
});

export const debtSchema = debtBaseSchema.superRefine((data, ctx) => {
  if (data.kind === "INSTALLMENT_PLAN") {
    if (!data.monthlyAmount || data.monthlyAmount <= 0) {
      ctx.addIssue({ code: "custom", path: ["monthlyAmount"], message: "Valor mensal combinado é obrigatório para parcelamento" });
    }
    if (!data.dueDay) {
      ctx.addIssue({ code: "custom", path: ["dueDay"], message: "Dia de vencimento é obrigatório para parcelamento" });
    }
  }
});
export type DebtInput = z.infer<typeof debtSchema>;

export const updateDebtSchema = debtBaseSchema.partial().extend({ id: z.string().uuid() });
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
