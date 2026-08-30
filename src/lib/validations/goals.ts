import { z } from "zod";

/**
 * Metas ("Goals"). See AI_CONTEXT.md "Metas". `goalTarget` is always required — a goal always has
 * an objective (just parking money is "leave it in the account"). `monthlyContribution` and
 * `endDate` are both optional: you can save without a fixed aporte or a deadline. When `endDate`
 * is set it drives the schedule and `monthlyContribution` becomes a (re)computed suggestion.
 *
 * `startCompetence` / `endDate` are "YYYY-MM" from the month pickers; the service normalizes them
 * to the first day of the month (same convention as debts.startCompetence).
 */
const goalBaseSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(120),
  goalTarget: z.number().positive("O valor da meta deve ser maior que zero"),
  startCompetence: z.string().min(1, "Mês de início é obrigatório"),
  endDate: z.string().optional().nullable(),
  monthlyContribution: z.number().positive("O aporte mensal deve ser maior que zero").optional().nullable(),
});

export const goalSchema = goalBaseSchema
  .extend({
    // Optional first RESERVE, created together with the goal — the "já comecei com R$ X" case.
    initialReserveAccountId: z.string().uuid().optional().nullable(),
    initialReserveAmount: z.number().positive().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.endDate && data.endDate < data.startCompetence.slice(0, 7)) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "A data final não pode ser antes do mês de início" });
    }
    if ((data.initialReserveAmount ?? 0) > 0 && !data.initialReserveAccountId) {
      ctx.addIssue({ code: "custom", path: ["initialReserveAccountId"], message: "Escolha a conta de onde sai a reserva inicial" });
    }
  });
export type GoalInput = z.infer<typeof goalSchema>;

/** `rebase: true` (from the "Recalcular" button) snapshots the schedule to today. Changing
 * `endDate` also triggers a rebase in the service. */
export const updateGoalSchema = goalBaseSchema.partial().extend({
  id: z.string().uuid(),
  rebase: z.boolean().optional(),
});
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;

/** Aporte — real money moves from a CASH/BANK account into the goal (transactions RESERVE). */
export const goalReserveSchema = z.object({
  goalId: z.string().uuid(),
  accountId: z.string().uuid(),
  amount: z.number().positive("Valor deve ser maior que zero"),
  date: z.string().min(1),
  description: z.string().max(500).optional().nullable(),
});
export type GoalReserveInput = z.infer<typeof goalReserveSchema>;

/**
 * Resgate — money moves from the goal back to a CASH/BANK account (transactions REDEEM). `reason`
 * overrides the auto choice (COMPLETED when the balance already reached the target, else EARLY).
 */
export const goalRedeemSchema = z.object({
  goalId: z.string().uuid(),
  accountId: z.string().uuid(),
  amount: z.number().positive("Valor deve ser maior que zero"),
  date: z.string().min(1),
  description: z.string().max(500).optional().nullable(),
  reason: z.enum(["COMPLETED", "EARLY"]).optional(),
});
export type GoalRedeemInput = z.infer<typeof goalRedeemSchema>;

/** "Informar rendimento" — enter the goal's current real balance; the service logs the delta as a
 * goal_yields row (synthetic INCOME under "Rendimentos"). Same UX as accounts' registerYield. */
export const goalYieldSchema = z.object({
  goalId: z.string().uuid(),
  realBalance: z.number().min(0),
  date: z.string().min(1),
});
export type GoalYieldInput = z.infer<typeof goalYieldSchema>;

/** Edit a RESERVE/REDEEM ledger row (typo fix) — propagates to the linked `transactions` row.
 * The kind (reserve vs redeem) can never change through an edit. */
export const updateGoalEntrySchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  amount: z.number().positive("Valor deve ser maior que zero"),
  date: z.string().min(1),
  description: z.string().max(500).optional().nullable(),
});
export type UpdateGoalEntryInput = z.infer<typeof updateGoalEntrySchema>;

export const updateGoalYieldSchema = z.object({
  id: z.string().uuid(),
  amount: z.number().positive("Valor deve ser maior que zero"),
  date: z.string().min(1),
  description: z.string().max(500).optional().nullable(),
});
export type UpdateGoalYieldInput = z.infer<typeof updateGoalYieldSchema>;
