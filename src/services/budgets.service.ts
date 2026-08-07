import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/getUser";
import { startOfMonth, endOfMonth } from "@/lib/utils/date";
import { getActualAmountForCategory } from "./_shared";
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

export async function createBudget(input: BudgetInput): Promise<string> {
  const supabase = await createClient();
  const user = await getUser();
  const { data, error } = await supabase
    .from("budgets")
    .insert({ user_id: user.id, category_id: input.categoryId, subcategory_id: input.subcategoryId ?? null, amount: input.amount })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function updateBudget(id: string, input: Partial<BudgetInput>): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("budgets")
    .update({
      ...(input.categoryId !== undefined ? { category_id: input.categoryId } : {}),
      ...(input.subcategoryId !== undefined ? { subcategory_id: input.subcategoryId } : {}),
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deactivateBudget(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("budgets").update({ active: false }).eq("id", id);
  if (error) throw new Error(error.message);
}
