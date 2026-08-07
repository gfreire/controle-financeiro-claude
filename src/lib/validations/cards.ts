import { z } from "zod";

export const cardPurchaseSchema = z.object({
  creditCardId: z.string().uuid(),
  amount: z.number().positive("Valor deve ser maior que zero"),
  purchaseDate: z.string().min(1),
  description: z.string().max(500).optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  subcategoryId: z.string().uuid().optional().nullable(),
  installments: z.number().int().min(1).max(48),
  isReservoir: z.boolean().optional(),
  // "YYYY-MM" override for the first installment's competence month — defaults to the
  // closing_day-derived month, but the user can pick a different one directly.
  firstCompetenceMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});
export type CardPurchaseInput = z.infer<typeof cardPurchaseSchema>;

export const updateCardPurchaseSchema = cardPurchaseSchema.partial().extend({ id: z.string().uuid() });

export const cardPaymentSchema = z.object({
  creditCardId: z.string().uuid(),
  accountId: z.string().uuid(),
  amount: z.number().positive(),
  paymentDate: z.string().min(1),
});
export type CardPaymentInput = z.infer<typeof cardPaymentSchema>;
