import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/getUser";
import { startOfMonth, endOfMonth } from "@/lib/utils/date";
import { reconcileBudgetFloors } from "./_shared";
import type { FixedExpenseInput } from "@/lib/validations/fixed-expenses";
import type { FixedExpenseDTO } from "@/types/dto";

/**
 * Before the real payment lands this month, `projectedAmount` shows the planned amount as a
 * placeholder; once a real transaction is linked via fixed_expense_id, it switches to the real
 * value — this is what avoids ever double-counting the placeholder and the real transaction.
 */
export async function getFixedExpenses(month: string): Promise<FixedExpenseDTO[]> {
  const supabase = await createClient();
  const user = await getUser();
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);

  const { data: fixedExpenses, error } = await supabase
    .from("fixed_expenses")
    .select("*, categories(name), subcategories(name)")
    .eq("user_id", user.id)
    .eq("active", true)
    .order("due_day");
  if (error) throw new Error(error.message);

  const results: FixedExpenseDTO[] = [];
  for (const row of fixedExpenses ?? []) {
    const { data: linked, error: linkedError } = await supabase
      .from("transactions")
      .select("amount")
      .eq("fixed_expense_id", row.id)
      .gte("date", monthStart)
      .lte("date", monthEnd);
    if (linkedError) throw new Error(linkedError.message);

    const actualAmount = (linked ?? []).reduce((sum, t) => sum + t.amount, 0);
    const isPaidThisMonth = actualAmount > 0;
    const projectedAmount = isPaidThisMonth ? actualAmount : row.amount;

    results.push({
      id: row.id,
      name: row.name,
      categoryId: row.category_id ?? "",
      categoryName: row.categories?.name ?? "",
      subcategoryId: row.subcategory_id ?? undefined,
      subcategoryName: row.subcategories?.name ?? undefined,
      plannedAmount: row.amount,
      dueDay: row.due_day,
      defaultAccountId: row.default_account_id ?? undefined,
      actualAmount,
      projectedAmount,
      isPaidThisMonth,
      status: actualAmount > row.amount ? "EXCEEDED" : "OK",
    });
  }
  return results;
}

/**
 * A fixed expense is a committed floor on its category/subcategory's budget — see
 * AI_CONTEXT.md "Budget hierarchy". Registering or raising one never blocks; it silently
 * (from this function's perspective) creates or raises the relevant budget(s) and returns
 * human-readable notices for the UI to surface.
 */
export async function createFixedExpense(input: FixedExpenseInput): Promise<{ id: string; notices: string[] }> {
  const supabase = await createClient();
  const user = await getUser();
  const { data, error } = await supabase
    .from("fixed_expenses")
    .insert({
      user_id: user.id,
      name: input.name,
      amount: input.amount,
      category_id: input.categoryId ?? null,
      subcategory_id: input.subcategoryId ?? null,
      default_account_id: input.defaultAccountId ?? null,
      due_day: input.dueDay,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const notices = await reconcileBudgetFloors(supabase, user.id, input.categoryId, input.subcategoryId);
  return { id: data.id, notices };
}

export async function updateFixedExpense(id: string, input: Partial<FixedExpenseInput>): Promise<{ notices: string[] }> {
  const supabase = await createClient();
  const user = await getUser();

  const { data: existing, error: fetchError } = await supabase
    .from("fixed_expenses")
    .select("category_id, subcategory_id")
    .eq("id", id)
    .single();
  if (fetchError) throw new Error(fetchError.message);

  const { error } = await supabase
    .from("fixed_expenses")
    .update({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.categoryId !== undefined ? { category_id: input.categoryId } : {}),
      ...(input.subcategoryId !== undefined ? { subcategory_id: input.subcategoryId } : {}),
      ...(input.defaultAccountId !== undefined ? { default_account_id: input.defaultAccountId } : {}),
      ...(input.dueDay !== undefined ? { due_day: input.dueDay } : {}),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  const categoryId = input.categoryId !== undefined ? input.categoryId : existing.category_id;
  const subcategoryId = input.subcategoryId !== undefined ? input.subcategoryId : existing.subcategory_id;
  const notices = await reconcileBudgetFloors(supabase, user.id, categoryId, subcategoryId);
  return { notices };
}

export async function deactivateFixedExpense(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("fixed_expenses").update({ active: false }).eq("id", id);
  if (error) throw new Error(error.message);
}
