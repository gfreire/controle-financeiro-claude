import { createClient } from "@/lib/supabase/server";
import { sumMoney } from "@/lib/utils/money";

/**
 * Real spend for a category/subcategory in a month: transactions (by date) +
 * card_installments (by competence, never purchase_date — see AI_CONTEXT.md).
 */
export async function getActualAmountForCategory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  categoryId: string,
  subcategoryId: string | null | undefined,
  monthStart: string,
  monthEnd: string
): Promise<number> {
  let txQuery = supabase
    .from("transactions")
    .select("amount")
    .eq("user_id", userId)
    .eq("category_id", categoryId)
    .gte("date", monthStart)
    .lte("date", monthEnd);
  if (subcategoryId) txQuery = txQuery.eq("subcategory_id", subcategoryId);

  const { data: transactions, error: txError } = await txQuery;
  if (txError) throw new Error(txError.message);

  let purchaseQuery = supabase.from("card_purchases").select("id").eq("user_id", userId).eq("category_id", categoryId);
  if (subcategoryId) purchaseQuery = purchaseQuery.eq("subcategory_id", subcategoryId);
  const { data: purchases, error: purchaseError } = await purchaseQuery;
  if (purchaseError) throw new Error(purchaseError.message);

  const purchaseIds = (purchases ?? []).map((p) => p.id);
  let installmentsTotal = 0;
  if (purchaseIds.length) {
    const { data: installments, error: installmentError } = await supabase
      .from("card_installments")
      .select("amount")
      .in("purchase_id", purchaseIds)
      .gte("competence", monthStart)
      .lte("competence", monthEnd);
    if (installmentError) throw new Error(installmentError.message);
    installmentsTotal = sumMoney((installments ?? []).map((i) => i.amount));
  }

  return sumMoney([sumMoney((transactions ?? []).map((t) => t.amount)), installmentsTotal]);
}
