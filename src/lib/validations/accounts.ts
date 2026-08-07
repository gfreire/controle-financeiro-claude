import { z } from "zod";

export const accountTypeSchema = z.enum(["CASH", "BANK", "CREDIT_CARD"]);

// Base object kept separate from its refinement — zod can't .partial() a schema that already
// has a .superRefine()/.refine() on it, and updateAccountSchema below needs to.
const accountBaseSchema = z.object({
  type: accountTypeSchema,
  name: z.string().min(1, "Nome é obrigatório").max(120),
  institutionId: z.string().uuid().optional().nullable(),
  color: z.string().optional().nullable(),
  initialBalance: z.number().optional(),
  overdraftLimit: z.number().min(0).optional(),
  closingDay: z.number().int().min(1).max(31).optional(),
  dueDay: z.number().int().min(1).max(31).optional(),
  creditLimit: z.number().min(0).optional().nullable(),
});

export const accountSchema = accountBaseSchema.superRefine((data, ctx) => {
  if (data.type === "CREDIT_CARD" && (data.closingDay === undefined || data.dueDay === undefined)) {
    ctx.addIssue({ code: "custom", path: ["closingDay"], message: "Dia de fechamento e vencimento são obrigatórios para cartão de crédito" });
  }
});

export type AccountInput = z.infer<typeof accountSchema>;

export const updateAccountSchema = accountBaseSchema.partial().extend({ id: z.string().uuid() });

export const registerYieldSchema = z.object({
  accountId: z.string().uuid(),
  realBalance: z.number(),
});

export const reconcileBalanceSchema = registerYieldSchema;
