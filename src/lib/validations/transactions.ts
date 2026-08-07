import { z } from "zod";

export const transactionTypeSchema = z.enum(["INCOME", "EXPENSE", "TRANSFER", "CREDIT_CARD_PAYMENT"]);
export type TransactionType = z.infer<typeof transactionTypeSchema>;

// Base object kept separate from its refinement — zod can't .partial() a schema that already
// has a .superRefine()/.refine() on it, and updateTransactionSchema below needs to.
const transactionBaseSchema = z.object({
  type: transactionTypeSchema,
  originAccountId: z.string().uuid().optional().nullable(),
  destinationAccountId: z.string().uuid().optional().nullable(),
  amount: z.number().positive("Valor deve ser maior que zero"),
  date: z.string().min(1, "Data é obrigatória"),
  description: z.string().max(500).optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  subcategoryId: z.string().uuid().optional().nullable(),
  fixedExpenseId: z.string().uuid().optional().nullable(),
});

export const transactionSchema = transactionBaseSchema.superRefine((data, ctx) => {
  if (data.type === "INCOME" && !data.destinationAccountId) {
    ctx.addIssue({ code: "custom", path: ["destinationAccountId"], message: "Conta de destino é obrigatória para receita" });
  }
  if (data.type === "EXPENSE" && !data.originAccountId) {
    ctx.addIssue({ code: "custom", path: ["originAccountId"], message: "Conta de origem é obrigatória para despesa" });
  }
  if ((data.type === "TRANSFER" || data.type === "CREDIT_CARD_PAYMENT") && (!data.originAccountId || !data.destinationAccountId)) {
    ctx.addIssue({ code: "custom", path: ["originAccountId"], message: "Origem e destino são obrigatórios" });
  }
  if (data.type === "TRANSFER" || data.type === "CREDIT_CARD_PAYMENT") {
    if (data.categoryId || data.subcategoryId) {
      ctx.addIssue({ code: "custom", path: ["categoryId"], message: "Transferências e pagamentos de fatura não usam categoria" });
    }
  }
});

export type TransactionInput = z.infer<typeof transactionSchema>;

export const updateTransactionSchema = transactionBaseSchema.partial().extend({
  id: z.string().uuid(),
});

/** Cross-field rule not enforced by the DB: an INCOME category can't hold a subcategory. */
export function validateCategoryTypeMatchesTransaction(
  categoryType: "INCOME" | "EXPENSE" | undefined,
  transactionType: "INCOME" | "EXPENSE" | "TRANSFER" | "CREDIT_CARD_PAYMENT",
  hasSubcategory: boolean
): string | null {
  if (transactionType !== "INCOME" && transactionType !== "EXPENSE") return null;
  if (categoryType && categoryType !== transactionType) {
    return "A categoria selecionada não corresponde ao tipo do lançamento";
  }
  if (categoryType === "INCOME" && hasSubcategory) {
    return "Categorias de receita não podem ter subcategoria";
  }
  return null;
}
