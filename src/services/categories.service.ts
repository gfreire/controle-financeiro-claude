import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/getUser";
import type { CategoryRow, SubcategoryRow, CategoryType } from "@/types/database";
import type { CategoryDTO, CategoryImportOptionDTO, CategoryUsageDTO, SubcategoryDTO, TransactionViewDTO } from "@/types/dto";
import type { CategoryInput, SubcategoryInput, ReassignCategoryInput } from "@/lib/validations/categories";

function toSubcategoryDTO(row: SubcategoryRow): SubcategoryDTO {
  return { id: row.id, categoryId: row.category_id, name: row.name, active: row.active };
}

function toCategoryDTO(row: CategoryRow, subcategories: SubcategoryRow[]): CategoryDTO {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    color: row.color,
    icon: row.icon,
    isSystem: row.is_system,
    isDefault: row.is_default,
    active: row.active,
    subcategories: subcategories.filter((s) => s.category_id === row.id).map(toSubcategoryDTO),
  };
}

/** Own categories + the permanent is_system catalog (Juros/Rendimentos/Ajuste), never the is_default starter pack. */
export async function getCategories(type?: CategoryType): Promise<CategoryDTO[]> {
  const supabase = await createClient();
  const user = await getUser();

  let query = supabase
    .from("categories")
    .select("*")
    .or(`user_id.eq.${user.id},is_system.eq.true`)
    .eq("active", true)
    .order("name");
  if (type) query = query.eq("type", type);

  const { data: categories, error } = await query;
  if (error) throw new Error(error.message);

  const categoryIds = (categories ?? []).map((c) => c.id);
  const { data: subcategories, error: subError } = await supabase
    .from("subcategories")
    .select("*")
    .in("category_id", categoryIds.length ? categoryIds : ["00000000-0000-0000-0000-000000000000"])
    .eq("active", true)
    .order("name");
  if (subError) throw new Error(subError.message);

  return (categories ?? []).map((row) => toCategoryDTO(row, subcategories ?? []));
}

export async function getSubcategories(categoryId: string): Promise<SubcategoryDTO[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subcategories")
    .select("*")
    .eq("category_id", categoryId)
    .eq("active", true)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map(toSubcategoryDTO);
}

/** Onboarding: the starter pack (is_default rows, user_id IS NULL) is COPIED into the user's own user_id. No FK back to the source. */
export async function getDefaultCategoryOptions(): Promise<CategoryDTO[]> {
  const supabase = await createClient();
  const { data: categories, error } = await supabase
    .from("categories")
    .select("*")
    .eq("is_default", true)
    .order("type")
    .order("name");
  if (error) throw new Error(error.message);

  const categoryIds = (categories ?? []).map((c) => c.id);
  const { data: subcategories, error: subError } = await supabase
    .from("subcategories")
    .select("*")
    .in("category_id", categoryIds.length ? categoryIds : ["00000000-0000-0000-0000-000000000000"])
    .order("name");
  if (subError) throw new Error(subError.message);

  return (categories ?? []).map((row) => toCategoryDTO(row, subcategories ?? []));
}

/**
 * Full starter pack (same as `getDefaultCategoryOptions`), annotated with what the user already
 * has. Unlike the old behavior of hiding already-imported categories entirely, the picker always
 * shows the complete `is_default` catalog — already-imported categories/subcategories render
 * checked+disabled (visible, not removable), while anything still missing (a whole new category,
 * or just a subcategory the user skipped under a category they already imported) stays selectable.
 * There's no FK linking a copy back to its `is_default` source (see AI_CONTEXT.md), so "already
 * imported" is judged the same way the copy itself is informal about: matching (type, name).
 */
export async function getDefaultCategoryImportOptions(): Promise<CategoryImportOptionDTO[]> {
  const supabase = await createClient();
  const user = await getUser();

  const [allDefaults, ownCategoriesRes] = await Promise.all([
    getDefaultCategoryOptions(),
    supabase.from("categories").select("id, name, type").eq("user_id", user.id),
  ]);
  if (ownCategoriesRes.error) throw new Error(ownCategoriesRes.error.message);
  const ownCategories = ownCategoriesRes.data ?? [];

  const ownCategoryIdByKey = new Map(ownCategories.map((c) => [`${c.type}:${c.name}`, c.id]));
  const ownCategoryIds = ownCategories.map((c) => c.id);

  const { data: ownSubcategories, error: subError } = ownCategoryIds.length
    ? await supabase.from("subcategories").select("name, category_id").in("category_id", ownCategoryIds)
    : { data: [] as { name: string; category_id: string }[], error: null };
  if (subError) throw new Error(subError.message);

  const ownSubcategoryNamesByCategoryId = new Map<string, Set<string>>();
  for (const sub of ownSubcategories ?? []) {
    if (!ownSubcategoryNamesByCategoryId.has(sub.category_id)) ownSubcategoryNamesByCategoryId.set(sub.category_id, new Set());
    ownSubcategoryNamesByCategoryId.get(sub.category_id)!.add(sub.name);
  }

  return allDefaults.map((category) => {
    const userCategoryId = ownCategoryIdByKey.get(`${category.type}:${category.name}`) ?? null;
    const ownSubNames = userCategoryId ? ownSubcategoryNamesByCategoryId.get(userCategoryId) ?? new Set<string>() : new Set<string>();
    return {
      id: category.id,
      name: category.name,
      type: category.type,
      color: category.color,
      icon: category.icon,
      alreadyImported: userCategoryId !== null,
      userCategoryId,
      subcategories: category.subcategories.map((sub) => ({
        id: sub.id,
        name: sub.name,
        alreadyImported: ownSubNames.has(sub.name),
      })),
    };
  });
}

/**
 * `selectedSubcategoryIds` lets the tree-picker (onboarding, or the Settings re-import) select a
 * category while excluding specific subcategories — e.g. keep "Moradia" but only "Aluguel", skip
 * "IPTU". A selected subcategory whose parent category ISN'T in `selectedCategoryIds` means the
 * user already has that category (its checkbox is disabled in the picker, see
 * `getDefaultCategoryImportOptions`) and is only adding a subcategory they'd skipped before — that
 * subcategory is attached to the user's EXISTING category copy (resolved by type+name, same
 * informal match used everywhere else) instead of creating a duplicate category.
 */
export async function copyDefaultCategories(selectedCategoryIds: string[], selectedSubcategoryIds: string[] = []): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();

  const { data: sourceSubcategories, error: subSourceError } = selectedSubcategoryIds.length
    ? await supabase.from("subcategories").select("*").in("id", selectedSubcategoryIds)
    : { data: [] as SubcategoryRow[], error: null };
  if (subSourceError) throw new Error(subSourceError.message);

  const sourceCategoryIds = new Set([...selectedCategoryIds, ...(sourceSubcategories ?? []).map((s) => s.category_id)]);
  if (!sourceCategoryIds.size) return;

  const { data: sourceCategories, error } = await supabase
    .from("categories")
    .select("*")
    .in("id", [...sourceCategoryIds])
    .eq("is_default", true);
  if (error) throw new Error(error.message);
  if (!sourceCategories?.length) return;

  const selectedCategorySet = new Set(selectedCategoryIds);
  const categoriesToCreate = sourceCategories.filter((c) => selectedCategorySet.has(c.id));
  const alreadyImportedSourceCategories = sourceCategories.filter((c) => !selectedCategorySet.has(c.id));

  const categoryIdMap = new Map<string, string>();
  const newCategories = categoriesToCreate.map((source) => {
    const newId = crypto.randomUUID();
    categoryIdMap.set(source.id, newId);
    return {
      id: newId,
      user_id: user.id,
      name: source.name,
      type: source.type,
      color: source.color,
      icon: source.icon,
      is_system: false,
      is_default: false,
    };
  });

  if (newCategories.length) {
    const { error: insertCategoriesError } = await supabase.from("categories").insert(newCategories);
    if (insertCategoriesError) throw new Error(insertCategoriesError.message);
  }

  if (alreadyImportedSourceCategories.length) {
    const { data: ownCategories, error: ownError } = await supabase
      .from("categories")
      .select("id, name, type")
      .eq("user_id", user.id)
      .in("type", [...new Set(alreadyImportedSourceCategories.map((c) => c.type))]);
    if (ownError) throw new Error(ownError.message);
    const ownIdByKey = new Map((ownCategories ?? []).map((c) => [`${c.type}:${c.name}`, c.id]));
    for (const source of alreadyImportedSourceCategories) {
      const ownId = ownIdByKey.get(`${source.type}:${source.name}`);
      if (ownId) categoryIdMap.set(source.id, ownId);
    }
  }

  const newSubcategories = (sourceSubcategories ?? [])
    .filter((source) => categoryIdMap.has(source.category_id))
    .map((source) => ({
      id: crypto.randomUUID(),
      user_id: user.id,
      category_id: categoryIdMap.get(source.category_id)!,
      name: source.name,
    }));

  if (newSubcategories.length) {
    const { error: insertSubcategoriesError } = await supabase.from("subcategories").insert(newSubcategories);
    if (insertSubcategoriesError) throw new Error(insertSubcategoriesError.message);
  }
}

export async function createCategory(input: CategoryInput): Promise<CategoryDTO> {
  const supabase = await createClient();
  const user = await getUser();

  const { data, error } = await supabase
    .from("categories")
    .insert({
      user_id: user.id,
      name: input.name,
      type: input.type,
      color: input.color,
      icon: input.icon ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return toCategoryDTO(data, []);
}

export async function updateCategory(id: string, input: Partial<CategoryInput>): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("categories")
    .update({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.icon !== undefined ? { icon: input.icon } : {}),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function createSubcategory(input: SubcategoryInput): Promise<SubcategoryDTO> {
  const supabase = await createClient();
  const user = await getUser();

  // Income categories never get a subcategory (AI_GENERATION_RULES.md "Domain Rules
  // Enforcement") — extra detail goes in the transaction's description instead. Enforced here,
  // not just by the UI omitting the create affordance, so any future entry point can't slip past it.
  const { data: category, error: categoryError } = await supabase
    .from("categories")
    .select("type")
    .eq("id", input.categoryId)
    .single();
  if (categoryError) throw new Error(categoryError.message);
  if (category.type === "INCOME") {
    throw new Error("Categorias de receita não podem ter subcategorias");
  }

  const { data, error } = await supabase
    .from("subcategories")
    .insert({ user_id: user.id, category_id: input.categoryId, name: input.name })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return toSubcategoryDTO(data);
}

export async function updateSubcategory(id: string, input: Partial<SubcategoryInput>): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("subcategories")
    .update({ ...(input.name !== undefined ? { name: input.name } : {}) })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

async function countReferences(supabase: Awaited<ReturnType<typeof createClient>>, column: "category_id" | "subcategory_id", id: string) {
  // debts has no subcategory_id column at all — default_category_id only ever mirrors category_id.
  const [transactions, cardPurchases, budgets, fixedExpenses, reservoirs, debts] = await Promise.all([
    supabase.from("transactions").select("id", { count: "exact", head: true }).eq(column, id),
    supabase.from("card_purchases").select("id", { count: "exact", head: true }).eq(column, id),
    supabase.from("budgets").select("id", { count: "exact", head: true }).eq(column, id),
    supabase.from("fixed_expenses").select("id", { count: "exact", head: true }).eq(column, id),
    supabase.from("reservoirs").select("id", { count: "exact", head: true }).eq(column, id),
    column === "category_id"
      ? supabase.from("debts").select("id", { count: "exact", head: true }).eq("default_category_id", id)
      : Promise.resolve({ count: 0 }),
  ]);
  return {
    transactions: transactions.count ?? 0,
    cardPurchases: cardPurchases.count ?? 0,
    budgets: budgets.count ?? 0,
    fixedExpenses: fixedExpenses.count ?? 0,
    reservoirs: reservoirs.count ?? 0,
    debts: debts.count ?? 0,
  };
}

async function previewTransactions(supabase: Awaited<ReturnType<typeof createClient>>, column: "category_id" | "subcategory_id", id: string): Promise<TransactionViewDTO[]> {
  const { data } = await supabase
    .from("transactions")
    .select("id, date, description, type, amount, category_id, subcategory_id, origin_account_id, destination_account_id")
    .eq(column, id)
    .order("date", { ascending: false })
    .limit(10);

  return (data ?? []).map((row) => ({
    id: row.id,
    date: row.date,
    description: row.description ?? "",
    type: row.type,
    categoryId: row.category_id,
    category: "",
    subcategoryId: row.subcategory_id,
    subcategory: "",
    accountId: row.origin_account_id ?? row.destination_account_id,
    account: "",
    accountType: null,
    amount: row.amount,
    source: "transaction" as const,
  }));
}

export async function getCategoryUsage(categoryId: string): Promise<CategoryUsageDTO> {
  const supabase = await createClient();
  const counts = await countReferences(supabase, "category_id", categoryId);
  const preview = await previewTransactions(supabase, "category_id", categoryId);
  return {
    count: counts.transactions + counts.cardPurchases,
    preview,
    budgetsCount: counts.budgets,
    fixedExpensesCount: counts.fixedExpenses,
    reservoirsCount: counts.reservoirs,
    debtsCount: counts.debts,
  };
}

export async function getSubcategoryUsage(subcategoryId: string): Promise<CategoryUsageDTO> {
  const supabase = await createClient();
  const counts = await countReferences(supabase, "subcategory_id", subcategoryId);
  const preview = await previewTransactions(supabase, "subcategory_id", subcategoryId);
  return {
    count: counts.transactions + counts.cardPurchases,
    preview,
    budgetsCount: counts.budgets,
    fixedExpensesCount: counts.fixedExpenses,
    reservoirsCount: counts.reservoirs,
    debtsCount: counts.debts,
  };
}

/**
 * Batch UPDATE of every row still referencing fromCategoryId/fromSubcategoryId — the only
 * path a category/subcategory delete may follow, since the FKs are RESTRICT by design.
 * `toCategoryId: null` clears both category_id and subcategory_id ("leave uncategorized").
 * `toSubcategoryId: undefined` with a `toCategoryId` set means "fall back to parent category".
 */
export async function reassignCategory(input: ReassignCategoryInput): Promise<void> {
  const supabase = await createClient();
  const column = input.fromSubcategoryId ? "subcategory_id" : "category_id";
  const fromId = input.fromSubcategoryId ?? input.fromCategoryId;
  if (!fromId && !input.fromUncategorized) throw new Error("fromCategoryId, fromSubcategoryId or fromUncategorized is required");

  const patch =
    input.toCategoryId === null
      ? { category_id: null, subcategory_id: null }
      : { category_id: input.toCategoryId, subcategory_id: input.toSubcategoryId ?? null };

  const tables = ["transactions", "card_purchases", "budgets", "fixed_expenses", "reservoirs"] as const;
  for (const table of tables) {
    const query = supabase.from(table).update(patch);
    const { error } = fromId ? await query.eq(column, fromId) : await query.is(column, null);
    if (error) throw new Error(error.message);
  }

  // debts has no subcategory_id column — default_category_id only ever mirrors category_id,
  // and a subcategory-targeted reassignment has nowhere to attach on a debt, so it's skipped.
  if (column === "category_id") {
    const debtsQuery = supabase.from("debts").update({ default_category_id: patch.category_id });
    const { error } = fromId ? await debtsQuery.eq("default_category_id", fromId) : await debtsQuery.is("default_category_id", null);
    if (error) throw new Error(error.message);
  }
}

export async function deleteCategory(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteSubcategory(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("subcategories").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
