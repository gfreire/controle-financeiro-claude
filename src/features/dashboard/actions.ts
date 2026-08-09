"use server";

import { revalidatePath } from "next/cache";
import { updateTransaction } from "@/services/transactions.service";
import { updateCardPurchase } from "@/services/cards.service";

type InlineEditInput = {
  id: string;
  source: "transaction" | "installment";
  purchaseId?: string;
  categoryId: string | null;
  subcategoryId: string | null;
  description?: string;
};

/**
 * Inline edit from the Transaction Explorer (AI_GENERATION_RULES.md "UI Component Rules" /
 * ARCHITECTURE.md "Dashboard Philosophy"): a dashboard table edit calls the partial-update
 * service directly instead of routing through a full-page form. `source: "installment"` rows
 * come from card_purchases, so the edit lands on the purchase (its category), not a transaction row —
 * `purchaseId`, not `id` (the installment's own id), is what identifies that row in card_purchases.
 */
export async function inlineEditTransaction(input: InlineEditInput) {
  if (input.source === "transaction") {
    await updateTransaction(input.id, {
      categoryId: input.categoryId,
      subcategoryId: input.subcategoryId,
      ...(input.description !== undefined ? { description: input.description } : {}),
    });
  } else {
    if (!input.purchaseId) throw new Error("purchaseId is required to edit an installment row");
    await updateCardPurchase(input.purchaseId, {
      categoryId: input.categoryId,
      subcategoryId: input.subcategoryId,
      ...(input.description !== undefined ? { description: input.description } : {}),
    });
  }
  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  revalidatePath("/cards");
  revalidatePath("/budgets");
}
