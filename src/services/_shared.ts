import { createClient } from "@/lib/supabase/server";
import { sumMoney } from "@/lib/utils/money";
import { formatCurrency } from "@/lib/utils/currency";
import { startOfMonth, todayIso, addMonthsToIsoDate } from "@/lib/utils/date";

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
 * Budget hierarchy floor — see AI_CONTEXT.md "Budget hierarchy". A category's budget must always
 * be >= the sum of its subcategory budgets (in `month`) plus its own directly-attached (no
 * subcategory) fixed expenses (fixed expenses aren't month-scoped — they're perpetual).
 */
export async function getCategoryBudgetFloor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  categoryId: string,
  month: string
): Promise<number> {
  const monthStart = startOfMonth(month);
  const [{ data: subBudgets, error: subError }, { data: fixedExpenses, error: feError }] = await Promise.all([
    supabase.from("budgets").select("amount").eq("user_id", userId).eq("category_id", categoryId).eq("month", monthStart).eq("active", true).not("subcategory_id", "is", null),
    supabase
      .from("fixed_expenses")
      .select("amount")
      .eq("user_id", userId)
      .eq("category_id", categoryId)
      .eq("active", true)
      .is("subcategory_id", null)
      .lte("start_competence", monthStart)
      .or(`end_competence.is.null,end_competence.gte.${monthStart}`),
  ]);
  if (subError) throw new Error(subError.message);
  if (feError) throw new Error(feError.message);
  return sumMoney([...(subBudgets ?? []).map((b) => b.amount), ...(fixedExpenses ?? []).map((f) => f.amount)]);
}

/**
 * A subcategory's budget must always be >= the sum of fixed expenses attached to it that are
 * actually active (start/end competence window) in `month` — a fixed expense that hasn't started
 * yet or has already ended doesn't count toward the floor of a month outside its window (see
 * AI_CONTEXT.md "Despesas Programadas — janela de competência").
 */
export async function getSubcategoryBudgetFloor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  subcategoryId: string,
  month: string
): Promise<number> {
  const monthStart = startOfMonth(month);
  const { data, error } = await supabase
    .from("fixed_expenses")
    .select("amount")
    .eq("user_id", userId)
    .eq("subcategory_id", subcategoryId)
    .eq("active", true)
    .lte("start_competence", monthStart)
    .or(`end_competence.is.null,end_competence.gte.${monthStart}`);
  if (error) throw new Error(error.message);
  return sumMoney((data ?? []).map((f) => f.amount));
}

async function raiseOrCreateBudgetToFloor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  categoryId: string,
  subcategoryId: string | null,
  month: string,
  label: string,
  floor: number
): Promise<string | null> {
  if (floor <= 0) return null;
  const monthStart = startOfMonth(month);

  let query = supabase.from("budgets").select("id, amount").eq("user_id", userId).eq("category_id", categoryId).eq("month", monthStart).eq("active", true);
  query = subcategoryId ? query.eq("subcategory_id", subcategoryId) : query.is("subcategory_id", null);
  const { data: existing, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);

  if (!existing) {
    const { error: insertError } = await supabase
      .from("budgets")
      .insert({ user_id: userId, category_id: categoryId, subcategory_id: subcategoryId, month: monthStart, amount: floor });
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
 * Called after any fixed-expense create/update, for one specific `month`, and returns
 * human-readable notices for the UI to surface. Never blocks. `subcategoryId` is the level a
 * fixed expense actually lands on:
 *
 * - When set, only the SUBCATEGORY's own floor is raised/created — a subcategory-level fixed
 *   expense never raises or creates the category's row (decided 2026-08-10, at the user's
 *   request — see AI_CONTEXT.md "Budget hierarchy" for the 4 worked cases). The category is only
 *   ever *deactivated* afterward, via `deactivateCategoryBudgetIfOverCommitted`, if the raised
 *   subcategory sum has caught up to (or passed) an already-existing category row; a category
 *   with no row of its own stays that way.
 * - When `null` (a fixed expense attached directly to the category, no subcategory), the
 *   category's own floor is raised/created as before — there's no subcategory level to defer to.
 */
export async function reconcileBudgetFloors(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  categoryId: string | null | undefined,
  subcategoryId: string | null | undefined,
  month: string
): Promise<string[]> {
  if (!categoryId) return [];
  const notices: string[] = [];

  if (subcategoryId) {
    const { data: subcategory } = await supabase.from("subcategories").select("name").eq("id", subcategoryId).single();
    const subFloor = await getSubcategoryBudgetFloor(supabase, userId, subcategoryId, month);
    const subNotice = await raiseOrCreateBudgetToFloor(supabase, userId, categoryId, subcategoryId, month, subcategory?.name ?? "subcategoria", subFloor);
    if (subNotice) notices.push(subNotice);

    const deactivateNotice = await deactivateCategoryBudgetIfOverCommitted(supabase, userId, categoryId, month);
    if (deactivateNotice) notices.push(deactivateNotice);
    return notices;
  }

  const { data: category } = await supabase.from("categories").select("name").eq("id", categoryId).single();
  const categoryName = category?.name ?? "categoria";
  const catFloor = await getCategoryBudgetFloor(supabase, userId, categoryId, month);
  const catNotice = await raiseOrCreateBudgetToFloor(supabase, userId, categoryId, null, month, categoryName, catFloor);
  if (catNotice) notices.push(catNotice);

  return notices;
}

/**
 * Fixed-expense-driven floor propagation, scoped to the two months a user can actually be
 * planning at once (decided 2026-08-08, AI_CONTEXT.md "Budgets"): always reconciles the current
 * real month, and — only if a budget already exists for next month **at the same level** this
 * fixed expense targets (the subcategory's row when `subcategoryId` is set, the category's row
 * otherwise) — reconciles next month too, so a fixed expense registered today doesn't silently
 * skip a plan the user already made ahead of time. Checking the matching level (fixed
 * 2026-08-10) matters now that a subcategory-level fixed expense never touches the category: a
 * user who only pre-planned next month's subcategory budget (no category row) must still get
 * that subcategory raised, not be skipped because no category row existed to gate on.
 */
export async function reconcileFixedExpenseFloors(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  categoryId: string | null | undefined,
  subcategoryId: string | null | undefined
): Promise<string[]> {
  if (!categoryId) return [];
  const currentMonth = startOfMonth(todayIso());
  const nextMonth = addMonthsToIsoDate(currentMonth, 1);

  const notices = await reconcileBudgetFloors(supabase, userId, categoryId, subcategoryId, currentMonth);

  let nextMonthQuery = supabase
    .from("budgets")
    .select("id")
    .eq("user_id", userId)
    .eq("category_id", categoryId)
    .eq("month", nextMonth)
    .eq("active", true);
  nextMonthQuery = subcategoryId ? nextMonthQuery.eq("subcategory_id", subcategoryId) : nextMonthQuery.is("subcategory_id", null);
  const { data: nextMonthBudget, error } = await nextMonthQuery.maybeSingle();
  if (error) throw new Error(error.message);

  if (nextMonthBudget) {
    notices.push(...(await reconcileBudgetFloors(supabase, userId, categoryId, subcategoryId, nextMonth)));
  }

  return notices;
}

/**
 * The actual fix for the "budget gets set to the sum of its subcategories" bug (AI_CONTEXT.md
 * "Budgets"): saving a subcategory budget (or raising one via a subcategory-level fixed expense)
 * never raises or creates the parent category's row — it can only invalidate an existing one. If
 * the category has an active explicit row for `month` and the subcategory budgets under it now
 * sum to **at least** that row's amount — including an exact fill with zero headroom left, not
 * only strictly exceeding it (tightened 2026-08-10 at the user's request: a category number is
 * only meaningful while it still represents real unallocated headroom over its subcategories) —
 * the category row is deactivated (never a "clamp"/silent value change) and a notice is returned.
 * A category with direct fixed expenses (no subcategory) is never touched here — the
 * fixed-expense auto-create guarantees its row exists for a real floor, and that floor must never
 * be silently orphaned.
 */
export async function deactivateCategoryBudgetIfOverCommitted(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  categoryId: string,
  month: string
): Promise<string | null> {
  const monthStart = startOfMonth(month);

  const { data: categoryBudget, error: catError } = await supabase
    .from("budgets")
    .select("id, amount")
    .eq("user_id", userId)
    .eq("category_id", categoryId)
    .eq("month", monthStart)
    .eq("active", true)
    .is("subcategory_id", null)
    .maybeSingle();
  if (catError) throw new Error(catError.message);
  if (!categoryBudget) return null;

  const [{ data: subBudgets, error: subError }, { data: directFixedExpenses, error: feError }] = await Promise.all([
    supabase.from("budgets").select("amount").eq("user_id", userId).eq("category_id", categoryId).eq("month", monthStart).eq("active", true).not("subcategory_id", "is", null),
    supabase
      .from("fixed_expenses")
      .select("id")
      .eq("user_id", userId)
      .eq("category_id", categoryId)
      .eq("active", true)
      .is("subcategory_id", null)
      .lte("start_competence", monthStart)
      .or(`end_competence.is.null,end_competence.gte.${monthStart}`),
  ]);
  if (subError) throw new Error(subError.message);
  if (feError) throw new Error(feError.message);

  if ((directFixedExpenses ?? []).length > 0) return null; // never orphan a direct fixed-expense floor

  const subcategorySum = sumMoney((subBudgets ?? []).map((b) => b.amount));
  if (categoryBudget.amount > subcategorySum) return null;

  const { data: category } = await supabase.from("categories").select("name").eq("id", categoryId).single();
  const { error: deactivateError } = await supabase.from("budgets").update({ active: false }).eq("id", categoryBudget.id);
  if (deactivateError) throw new Error(deactivateError.message);

  return `O orçamento de ${category?.name ?? "categoria"} foi removido porque as subcategorias já ocupam todo o valor cadastrado (${formatCurrency(subcategorySum)}), sem espaço livre.`;
}
