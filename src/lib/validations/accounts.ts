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
  // 1-28, não 1-31: evita lógica de mês com menos dias — o próprio banco já opera assim.
  closingDay: z.number().int().min(1).max(28).optional(),
  dueDay: z.number().int().min(1).max(28).optional(),
  // No .min()/.positive() here on purpose — creditLimit is CREDIT_CARD-only and its ">0, always
  // required" rule depends on `type`/on whether the field is even present in a partial update,
  // which a base-schema constraint can't express. Enforced in the two superRefines below instead.
  creditLimit: z.number().optional().nullable(),
});

export const accountSchema = accountBaseSchema.superRefine((data, ctx) => {
  if (data.type === "CREDIT_CARD") {
    if (data.closingDay === undefined || data.dueDay === undefined) {
      ctx.addIssue({ code: "custom", path: ["closingDay"], message: "Dia de fechamento e vencimento são obrigatórios para cartão de crédito" });
    }
    // Decided 2026-08-08: a credit card account must always carry a real limit — see AI_CONTEXT.md
    // "Accounts". This replaces the earlier "optional, soft-enforced" design.
    if (data.creditLimit === undefined || data.creditLimit === null || data.creditLimit <= 0) {
      ctx.addIssue({ code: "custom", path: ["creditLimit"], message: "O limite do cartão é obrigatório e deve ser maior que zero" });
    }
  }
});

export type AccountInput = z.infer<typeof accountSchema>;

export const updateAccountSchema = accountBaseSchema
  .partial()
  .extend({ id: z.string().uuid() })
  .superRefine((data, ctx) => {
    // A partial update may omit creditLimit entirely (e.g. only editing closing/due day) — that's
    // fine. What's never allowed is explicitly clearing or zeroing it out once it's part of the payload.
    if (data.creditLimit !== undefined && (data.creditLimit === null || data.creditLimit <= 0)) {
      ctx.addIssue({ code: "custom", path: ["creditLimit"], message: "O limite do cartão é obrigatório e deve ser maior que zero" });
    }
  });

export const registerYieldSchema = z.object({
  accountId: z.string().uuid(),
  realBalance: z.number(),
});

export const reconcileBalanceSchema = registerYieldSchema;

// "Lançar Juros": an explicit amount (not a delta against a stated balance like the two above) —
// the account's own type decides how it's recorded (see accounts.service.ts#registerInterest).
export const registerInterestSchema = z.object({
  accountId: z.string().uuid(),
  amount: z.number().positive("Informe um valor maior que zero"),
  date: z.string().min(1, "Data é obrigatória"),
});
