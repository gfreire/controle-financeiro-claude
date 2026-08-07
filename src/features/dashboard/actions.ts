"use server";

import { revalidatePath } from "next/cache";
import { updateTransaction } from "@/services/transactions.service";
import { updateCardPurchase } from "@/services/cards.service";
import { reassignCategory } from "@/services/categories.service";

type InlineEditInput = {
  id: string;
  source: "transaction" | "installment";
  categoryId: string | null;
  subcategoryId: string | null;
  description?: string;
};

/**
 * Inline edit from the Transaction Explorer (AI_GENERATION_RULES.md "UI Component Rules" /
 * ARCHITECTURE.md "Dashboard Philosophy"): a dashboard table edit calls the partial-update
 * service directly instead of routing through a full-page form. `source: "installment"` rows
 * come from card_purchases, so the edit lands on the purchase (its category), not a transaction row.
 */
export async function inlineEditTransaction(input: InlineEditInput) {
  if (input.source === "transaction") {
    await updateTransaction(input.id, {
      categoryId: input.categoryId,
      subcategoryId: input.subcategoryId,
      ...(input.description !== undefined ? { description: input.description } : {}),
    });
  } else {
    await updateCardPurchase(input.id, {
      categoryId: input.categoryId,
      subcategoryId: input.subcategoryId,
      ...(input.description !== undefined ? { description: input.description } : {}),
    });
  }
  revalidatePath("/dashboard");
  revalidatePath("/transactions");
}

export async function bulkReassignTransactions(input: {
  fromCategoryId?: string;
  fromSubcategoryId?: string;
  toCategoryId: string | null;
  toSubcategoryId?: string | null;
}) {
  await reassignCategory(input);
  revalidatePath("/dashboard");
  revalidatePath("/transactions");
}
