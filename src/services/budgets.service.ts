import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/getUser";
import { startOfMonth, endOfMonth, todayIso, addMonthsToIsoDate } from "@/lib/utils/date";
import { formatCurrency } from "@/lib/utils/currency";
import {
  getActualAmountForCategory,
  getCategoryBudgetFloor,
  getSubcategoryBudgetFloor,
  deactivateCategoryBudgetIfOverCommitted,
} from "./_shared";
import type { BudgetInput } from "@/lib/validations/budgets";
import type { BudgetDTO, BudgetTreeCategoryDTO, BudgetTreeSubcategoryDTO, BudgetMonthWindowDTO, FixedExpenseDTO } from "@/types/dto";

/** month: any ISO date within the target month — normalized to the first-of-month row value. */
export async function getBudgets(month: string): Promise<BudgetDTO[]> {
  const supabase = await createClient();
  const user = await getUser();
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);

  const { data: budgets, error } = await supabase
    .from("budgets")
    .select("*, categories(name), subcategories(name)")
    .eq("user_id", user.id)
    .eq("month", monthStart)
    .eq("active", true);
  if (error) throw new Error(error.message);

  const results = await Promise.all(
    (budgets ?? [])
      .filter((row) => row.category_id)
      .map(async (row) => {
        const actualAmount = await getActualAmountForCategory(supabase, user.id, row.category_id!, row.subcategory_id, monthStart, monthEnd);
        return {
          id: row.id,
          categoryId: row.category_id!,
          categoryName: row.categories?.name ?? "",
          subcategoryId: row.subcategory_id ?? undefined,
          subcategoryName: row.subcategories?.name ?? undefined,
          plannedAmount: row.amount,
          actualAmount,
          status: actualAmount > row.amount ? "EXCEEDED" : "OK",
        } satisfies BudgetDTO;
      })
  );
  return results;
}

/**
 * Tree-shaped, grouped read used by the /budgets page and the dashboard panel (AI_CONTEXT.md
 * "Budgets"). A category's `budget` is its own real row for `month`, or `null` — never a computed
 * stand-in (see the "Budgets" doc section for why an implicit sum would create false alerts).
 * `fixedExpenses` is passed in rather than re-fetched — the caller already has it from
 * `getFixedExpenses(month)`, and this function only needs it for grouping/nesting.
 */
export async function getBudgetTree(month: string, fixedExpenses: FixedExpenseDTO[]): Promise<BudgetTreeCategoryDTO[]> {
  const supabase = await createClient();
  const user = await getUser();
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);

  const { data: rowsData, error } = await supabase
    .from("budgets")
    .select("id, category_id, subcategory_id, amount, categories(name, icon), subcategories(name)")
    .eq("user_id", user.id)
    .eq("month", monthStart)
    .eq("active", true);
  if (error) throw new Error(error.message);
  const rows = (rowsData ?? []) as unknown as Array<{
    id: string;
    category_id: string | null;
    subcategory_id: string | null;
    amount: number;
    categories: { name: string; icon: string | null } | null;
    subcategories: { name: string } | null;
  }>;

  // Defensive, mirrors getBudgets above — category_id is nullable at the DB level even though
  // the app never creates a row without one; `.eq()` with a JS `null` would otherwise serialize
  // to the literal string "null" and fail as an invalid uuid.
  const validRows = rows.filter((r) => r.category_id);
  const categoryRows = validRows.filter((r) => !r.subcategory_id);
  const subcategoryRows = validRows.filter((r) => r.subcategory_id);
  const categoryIds = new Set<string>([
    ...categoryRows.map((r) => r.category_id as string),
    ...subcategoryRows.map((r) => r.category_id as string),
  ]);

  const tree = await Promise.all(
    [...categoryIds].map(async (categoryId) => {
      const categoryRow = categoryRows.find((r) => r.category_id === categoryId);
      const subRowsHere = subcategoryRows.filter((r) => r.category_id === categoryId);
      const directFixedExpenses = fixedExpenses.filter((f) => f.categoryId === categoryId && !f.subcategoryId);

      const categoryName = categoryRow?.categories?.name ?? subRowsHere[0]?.categories?.name ?? "";
      const icon = categoryRow?.categories?.icon ?? subRowsHere[0]?.categories?.icon ?? null;

      const [categoryActual, subcategories] = await Promise.all([
        categoryRow
          ? getActualAmountForCategory(supabase, user.id, categoryId, undefined, monthStart, monthEnd)
          : Promise.resolve(null),
        Promise.all(
          subRowsHere.map(async (sr) => {
            const actualAmount = await getActualAmountForCategory(supabase, user.id, categoryId, sr.subcategory_id, monthStart, monthEnd);
            return {
              budgetId: sr.id,
              subcategoryId: sr.subcategory_id as string,
              subcategoryName: sr.subcategories?.name ?? "",
              plannedAmount: sr.amount,
              actualAmount,
              status: actualAmount > sr.amount ? "EXCEEDED" : "OK",
              fixedExpenses: fixedExpenses.filter((f) => f.subcategoryId === sr.subcategory_id),
            } satisfies BudgetTreeSubcategoryDTO;
          })
        ),
      ]);

      const budget: BudgetTreeCategoryDTO["budget"] =
        categoryRow && categoryActual !== null
          ? { id: categoryRow.id, plannedAmount: categoryRow.amount, actualAmount: categoryActual, status: categoryActual > categoryRow.amount ? "EXCEEDED" : "OK" }
          : null;

      return { categoryId, categoryName, icon, budget, subcategories, directFixedExpenses } satisfies BudgetTreeCategoryDTO;
    })
  );

  return tree;
}

/**
 * Which months a user can actually plan right now (AI_CONTEXT.md "Budgets"): the current real
 * month is always plannable; the next one unlocks once the current month has a budget.
 * `lastRegisteredMonth` drives "clone from" — the most recent month with any active budget row,
 * which may be well before `currentMonth` if the user hasn't opened the app in a while.
 */
export async function getBudgetMonthWindow(): Promise<BudgetMonthWindowDTO> {
  const supabase = await createClient();
  const user = await getUser();
  const currentMonth = startOfMonth(todayIso());
  const nextMonth = addMonthsToIsoDate(currentMonth, 1);

  const { data: currentRow, error: currentError } = await supabase
    .from("budgets")
    .select("id")
    .eq("user_id", user.id)
    .eq("month", currentMonth)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (currentError) throw new Error(currentError.message);

  const { data: lastRow, error: lastError } = await supabase
    .from("budgets")
    .select("month")
    .eq("user_id", user.id)
    .eq("active", true)
    .order("month", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) throw new Error(lastError.message);

  return {
    currentMonth,
    nextMonth,
    hasCurrentMonthBudget: !!currentRow,
    lastRegisteredMonth: lastRow?.month ?? null,
  };
}

/** Bulk-copies every active row from `fromMonth` into `toMonth` — no floor re-validation needed, since a self-consistent prior month's rows can't produce an inconsistent result when copied verbatim. */
export async function cloneBudgetMonth(fromMonth: string, toMonth: string): Promise<{ count: number }> {
  const supabase = await createClient();
  const user = await getUser();
  const fromStart = startOfMonth(fromMonth);
  const toStart = startOfMonth(toMonth);

  const { data: rows, error } = await supabase
    .from("budgets")
    .select("category_id, subcategory_id, amount")
    .eq("user_id", user.id)
    .eq("month", fromStart)
    .eq("active", true);
  if (error) throw new Error(error.message);
  if (!rows || rows.length === 0) return { count: 0 };

  const { error: insertError } = await supabase.from("budgets").insert(
    rows.map((r) => ({ user_id: user.id, category_id: r.category_id, subcategory_id: r.subcategory_id, month: toStart, amount: r.amount }))
  );
  if (insertError) throw new Error(insertError.message);

  return { count: rows.length };
}

/**
 * Exposes the same floor `createBudget`/`updateBudget` enforce server-side, so the client can
 * show/enforce it on the amount input directly instead of only surfacing it as a post-submit
 * error. The server check below remains the source of truth.
 */
export async function getBudgetFloor(categoryId: string, subcategoryId: string | null | undefined, month: string): Promise<number> {
  const supabase = await createClient();
  const user = await getUser();
  return subcategoryId
    ? getSubcategoryBudgetFloor(supabase, user.id, subcategoryId)
    : getCategoryBudgetFloor(supabase, user.id, categoryId, startOfMonth(month));
}

/**
 * Floor check is a hard block (never a soft warning, unlike the credit-limit pattern) — see
 * AI_CONTEXT.md "Budget hierarchy": a budget that contradicts its own committed children
 * (subcategory budgets, or fixed expenses) is simply wrong, not a maybe-forgot-something call.
 */
export async function createBudget(input: BudgetInput): Promise<{ id: string; notices: string[] }> {
  const supabase = await createClient();
  const user = await getUser();
  const monthStart = startOfMonth(input.month);

  const floor = input.subcategoryId
    ? await getSubcategoryBudgetFloor(supabase, user.id, input.subcategoryId)
    : await getCategoryBudgetFloor(supabase, user.id, input.categoryId, monthStart);
  if (input.amount < floor) {
    throw new Error(`O orçamento não pode ser menor que ${formatCurrency(floor)} — já comprometido em despesas fixas${input.subcategoryId ? "" : "/subcategorias"}.`);
  }

  const { data, error } = await supabase
    .from("budgets")
    .insert({ user_id: user.id, category_id: input.categoryId, subcategory_id: input.subcategoryId ?? null, month: monthStart, amount: input.amount })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // Saving a subcategory budget never raises/creates the category's row — it can only erase an
  // existing one that's no longer sufficient (AI_CONTEXT.md "Budgets" — this replaces the old
  // auto-raise bug).
  const notice = input.subcategoryId ? await deactivateCategoryBudgetIfOverCommitted(supabase, user.id, input.categoryId, monthStart) : null;
  return { id: data.id, notices: notice ? [notice] : [] };
}

export async function updateBudget(id: string, input: Partial<BudgetInput>): Promise<{ notices: string[] }> {
  const supabase = await createClient();
  const user = await getUser();

  const { data: existing, error: fetchError } = await supabase
    .from("budgets")
    .select("category_id, subcategory_id, month")
    .eq("id", id)
    .single();
  if (fetchError) throw new Error(fetchError.message);

  const categoryId = input.categoryId ?? existing.category_id;
  const subcategoryId = input.subcategoryId !== undefined ? input.subcategoryId : existing.subcategory_id;
  const month = existing.month; // immutable after creation — a budget row never moves months

  if (input.amount !== undefined) {
    const floor = subcategoryId
      ? await getSubcategoryBudgetFloor(supabase, user.id, subcategoryId)
      : await getCategoryBudgetFloor(supabase, user.id, categoryId, month);
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

  const notice = subcategoryId ? await deactivateCategoryBudgetIfOverCommitted(supabase, user.id, categoryId, month) : null;
  return { notices: notice ? [notice] : [] };
}

/**
 * A budget row that's the committed floor for one or more fixed expenses can never be deleted —
 * only raised/edited (AI_CONTEXT.md "Budget hierarchy") — deleting it would orphan that floor.
 * This mirrors `deactivateCategoryBudgetIfOverCommitted`'s own guard (_shared.ts) for the
 * auto-deactivate path, but enforced here too since this is the direct, user-triggered delete —
 * both the single-row delete button and the tree editor's blank-field-deletes-it shortcut land here.
 */
export async function deactivateBudget(id: string): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();

  const { data: existing, error: fetchError } = await supabase
    .from("budgets")
    .select("category_id, subcategory_id")
    .eq("id", id)
    .single();
  if (fetchError) throw new Error(fetchError.message);

  let fixedExpenseQuery = supabase.from("fixed_expenses").select("id").eq("user_id", user.id).eq("active", true);
  fixedExpenseQuery = existing.subcategory_id
    ? fixedExpenseQuery.eq("subcategory_id", existing.subcategory_id)
    : fixedExpenseQuery.eq("category_id", existing.category_id).is("subcategory_id", null);
  const { data: fixedExpenses, error: feError } = await fixedExpenseQuery.limit(1);
  if (feError) throw new Error(feError.message);
  if (fixedExpenses && fixedExpenses.length > 0) {
    throw new Error("Este orçamento não pode ser excluído — há despesas fixas vinculadas a ele. Edite o valor em vez de excluir.");
  }

  const { error } = await supabase.from("budgets").update({ active: false }).eq("id", id);
  if (error) throw new Error(error.message);
}
