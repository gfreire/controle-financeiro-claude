import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/getUser";
import { startOfMonth, endOfMonth } from "@/lib/utils/date";
import { formatCurrency } from "@/lib/utils/currency";
import { getActualAmountForCategory, getCategoryBudgetFloor, getSubcategoryBudgetFloor, reconcileBudgetFloors } from "./_shared";
import type { BudgetInput } from "@/lib/validations/budgets";
import type { BudgetDTO } from "@/types/dto";

/** month: any ISO date within the target month — the month is a query parameter, never a stored column. */
export async function getBudgets(month: string): Promise<BudgetDTO[]> {
  const supabase = await createClient();
  const user = await getUser();
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);

  const { data: budgets, error } = await supabase
    .from("budgets")
    .select("*, categories(name), subcategories(name)")
    .eq("user_id", user.id)
    .eq("active", true);
  if (error) throw new Error(error.message);

  const results: BudgetDTO[] = [];
  for (const row of budgets ?? []) {
    if (!row.category_id) continue;
    const actualAmount = await getActualAmountForCategory(supabase, user.id, row.category_id, row.subcategory_id, monthStart, monthEnd);
    results.push({
      id: row.id,
      categoryId: row.category_id,
      categoryName: row.categories?.name ?? "",
      subcategoryId: row.subcategory_id ?? undefined,
      subcategoryName: row.subcategories?.name ?? undefined,
      plannedAmount: row.amount,
      actualAmount,
      status: actualAmount > row.amount ? "EXCEEDED" : "OK",
    });
  }
  return results;
}

/**
 * Floor check is a hard block (never a soft warning, unlike the credit-limit pattern) — see
 * AI_CONTEXT.md "Budget hierarchy": a budget that contradicts its own committed children
 * (subcategory budgets, or fixed expenses) is simply wrong, not a maybe-forgot-something call.
 */
export async function createBudget(input: BudgetInput): Promise<{ id: string; notices: string[] }> {
  const supabase = await createClient();
  const user = await getUser();

  const floor = input.subcategoryId
    ? await getSubcategoryBudgetFloor(supabase, user.id, input.subcategoryId)
    : await getCategoryBudgetFloor(supabase, user.id, input.categoryId);
  if (input.amount < floor) {
    throw new Error(`O orçamento não pode ser menor que ${formatCurrency(floor)} — já comprometido em despesas fixas${input.subcategoryId ? "" : "/subcategorias"}.`);
  }

  const { data, error } = await supabase
    .from("budgets")
    .insert({ user_id: user.id, category_id: input.categoryId, subcategory_id: input.subcategoryId ?? null, amount: input.amount })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // A new subcategory budget can itself push the category's committed total over its current
  // budget — bubble up and auto-raise the category if so (never re-touches the row just saved).
  const notices = input.subcategoryId ? await reconcileBudgetFloors(supabase, user.id, input.categoryId, null) : [];
  return { id: data.id, notices };
}

export async function updateBudget(id: string, input: Partial<BudgetInput>): Promise<{ notices: string[] }> {
  const supabase = await createClient();
  const user = await getUser();

  const { data: existing, error: fetchError } = await supabase
    .from("budgets")
    .select("category_id, subcategory_id")
    .eq("id", id)
    .single();
  if (fetchError) throw new Error(fetchError.message);

  const categoryId = input.categoryId ?? existing.category_id;
  const subcategoryId = input.subcategoryId !== undefined ? input.subcategoryId : existing.subcategory_id;

  if (input.amount !== undefined) {
    const floor = subcategoryId
      ? await getSubcategoryBudgetFloor(supabase, user.id, subcategoryId)
      : await getCategoryBudgetFloor(supabase, user.id, categoryId);
    if (input.amount < floor) {
      throw new Error(`O orçamento não pode ser menor que ${formatCurrency(floor)} — já comprometido em despesas fixas${subcategoryId ? "" : "/subcategorias"}.`);
    }
  }

  const { error } = await supabase
    .from("budgets")
    .update({
      ...(input.categoryId !== undefined ? { category_id: input.categoryId } : {}),
      ...(input.subcategoryId !== undefined ? { subcategory_id: input.subcategoryId } : {}),
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  const notices = subcategoryId ? await reconcileBudgetFloors(supabase, user.id, categoryId, null) : [];
  return { notices };
}

export async function deactivateBudget(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("budgets").update({ active: false }).eq("id", id);
  if (error) throw new Error(error.message);
}
