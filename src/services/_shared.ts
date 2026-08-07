import { createClient } from "@/lib/supabase/server";
import { sumMoney } from "@/lib/utils/money";
import { formatCurrency } from "@/lib/utils/currency";

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

/**
 * Budget hierarchy floor — see AI_CONTEXT.md "Budget hierarchy — category vs. subcategory,
 * and the fixed-expense floor". A category's budget must always be >= the sum of its
 * subcategory budgets plus its own directly-attached (no subcategory) fixed expenses.
 */
export async function getCategoryBudgetFloor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  categoryId: string
): Promise<number> {
  const [{ data: subBudgets, error: subError }, { data: fixedExpenses, error: feError }] = await Promise.all([
    supabase.from("budgets").select("amount").eq("user_id", userId).eq("category_id", categoryId).eq("active", true).not("subcategory_id", "is", null),
    supabase.from("fixed_expenses").select("amount").eq("user_id", userId).eq("category_id", categoryId).eq("active", true).is("subcategory_id", null),
  ]);
  if (subError) throw new Error(subError.message);
  if (feError) throw new Error(feError.message);
  return sumMoney([...(subBudgets ?? []).map((b) => b.amount), ...(fixedExpenses ?? []).map((f) => f.amount)]);
}

/** A subcategory's budget must always be >= the sum of fixed expenses attached to it. */
export async function getSubcategoryBudgetFloor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  subcategoryId: string
): Promise<number> {
  const { data, error } = await supabase
    .from("fixed_expenses")
    .select("amount")
    .eq("user_id", userId)
    .eq("subcategory_id", subcategoryId)
    .eq("active", true);
  if (error) throw new Error(error.message);
  return sumMoney((data ?? []).map((f) => f.amount));
}

async function raiseOrCreateBudgetToFloor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  categoryId: string,
  subcategoryId: string | null,
  label: string,
  floor: number
): Promise<string | null> {
  if (floor <= 0) return null;

  let query = supabase.from("budgets").select("id, amount").eq("user_id", userId).eq("category_id", categoryId).eq("active", true);
  query = subcategoryId ? query.eq("subcategory_id", subcategoryId) : query.is("subcategory_id", null);
  const { data: existing, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);

  if (!existing) {
    const { error: insertError } = await supabase
      .from("budgets")
      .insert({ user_id: userId, category_id: categoryId, subcategory_id: subcategoryId, amount: floor });
    if (insertError) throw new Error(insertError.message);
    return `Orçamento de ${label} criado em ${formatCurrency(floor)} para acomodar a(s) despesa(s) fixa(s) registrada(s).`;
  }
  if (existing.amount < floor) {
    const { error: updateError } = await supabase.from("budgets").update({ amount: floor }).eq("id", existing.id);
    if (updateError) throw new Error(updateError.message);
    return `Orçamento de ${label} foi aumentado de ${formatCurrency(existing.amount)} para ${formatCurrency(floor)} para acomodar o que já está comprometido.`;
  }
  return null;
}

/**
 * Called after any fixed-expense create/update, or after saving a subcategory budget —
 * never blocks, only raises (or creates) the budget(s) whose committed children now exceed
 * them, and returns human-readable notices for the UI to surface. `subcategoryId` should be
 * the level that was just touched (a fixed expense's own subcategory, if any); pass `null`
 * when only bubbling up to the category (e.g. after saving a subcategory budget directly —
 * that row's own floor was already enforced as a hard block at save time).
 */
export async function reconcileBudgetFloors(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  categoryId: string | null | undefined,
  subcategoryId: string | null | undefined
): Promise<string[]> {
  if (!categoryId) return [];
  const notices: string[] = [];

  const { data: category } = await supabase.from("categories").select("name").eq("id", categoryId).single();
  const categoryName = category?.name ?? "categoria";

  if (subcategoryId) {
    const { data: subcategory } = await supabase.from("subcategories").select("name").eq("id", subcategoryId).single();
    const subFloor = await getSubcategoryBudgetFloor(supabase, userId, subcategoryId);
    const subNotice = await raiseOrCreateBudgetToFloor(supabase, userId, categoryId, subcategoryId, subcategory?.name ?? "subcategoria", subFloor);
    if (subNotice) notices.push(subNotice);
  }

  const catFloor = await getCategoryBudgetFloor(supabase, userId, categoryId);
  const catNotice = await raiseOrCreateBudgetToFloor(supabase, userId, categoryId, null, categoryName, catFloor);
  if (catNotice) notices.push(catNotice);

  return notices;
}
