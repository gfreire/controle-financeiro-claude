import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/getUser";
import { sumMoney, subtractMoney } from "@/lib/utils/money";
import { monthKey, formatMonthLabel, addMonthsToIsoDate } from "@/lib/utils/date";
import { getAccounts } from "./accounts.service";
import type {
  DashboardFilters,
  FinancialSummaryDTO,
  MonthlyEvolutionDTO,
  CategoryDistributionDTO,
  CategoryComparisonDTO,
  TransactionViewDTO,
} from "@/types/dto";
import type { AccountType } from "@/types/database";

type Entry = {
  amount: number;
  date: string;
  type: "INCOME" | "EXPENSE";
  categoryId: string | null;
  categoryName: string;
  categoryColor: string;
  categoryIcon: string | null;
};

/**
 * Central aggregation point: pulls from `transactions` (INCOME/EXPENSE only —
 * TRANSFER and CREDIT_CARD_PAYMENT never count as analytics, see
 * AI_CONTEXT.md "Money Reality Rules") and `card_installments` (by
 * competence, never purchase_date). Every chart method below derives from
 * this same entry set so the numbers stay consistent across the dashboard.
 */
async function fetchPeriodEntries(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  filters: DashboardFilters
): Promise<Entry[]> {
  const entries: Entry[] = [];

  let txQuery = supabase
    .from("transactions")
    .select("amount, date, type, category_id, categories(name, color, icon)")
    .eq("user_id", userId)
    .in("type", ["INCOME", "EXPENSE"])
    .gte("date", filters.periodStart)
    .lte("date", filters.periodEnd);

  if (filters.transactionType) txQuery = txQuery.eq("type", filters.transactionType);
  if (filters.uncategorizedOnly) txQuery = txQuery.is("category_id", null);
  else if (filters.categories?.length) txQuery = txQuery.in("category_id", filters.categories);
  if (filters.subcategories?.length) txQuery = txQuery.in("subcategory_id", filters.subcategories);
  if (filters.accounts?.length) {
    const list = filters.accounts.join(",");
    txQuery = txQuery.or(`origin_account_id.in.(${list}),destination_account_id.in.(${list})`);
  }

  const { data: transactionsData, error: txError } = await txQuery;
  if (txError) throw new Error(txError.message);
  const transactions = (transactionsData ?? []) as unknown as Array<{
    amount: number;
    date: string;
    type: "INCOME" | "EXPENSE";
    category_id: string | null;
    categories: { name: string; color: string; icon: string | null } | null;
  }>;

  for (const row of transactions) {
    entries.push({
      amount: row.amount,
      date: row.date,
      type: row.type,
      categoryId: row.category_id,
      categoryName: row.categories?.name ?? "Sem categoria",
      categoryColor: row.categories?.color ?? "#98989b",
      categoryIcon: row.categories?.icon ?? null,
    });
  }

  // Card installments are always EXPENSE — skip entirely when the caller asked for INCOME only.
  if (filters.transactionType !== "INCOME") {
    let purchaseQuery = supabase
      .from("card_purchases")
      .select("id, category_id, credit_card_id, categories(name, color, icon)")
      .eq("user_id", userId);
    if (filters.uncategorizedOnly) purchaseQuery = purchaseQuery.is("category_id", null);
    else if (filters.categories?.length) purchaseQuery = purchaseQuery.in("category_id", filters.categories);
    if (filters.subcategories?.length) purchaseQuery = purchaseQuery.in("subcategory_id", filters.subcategories);
    if (filters.accounts?.length) purchaseQuery = purchaseQuery.in("credit_card_id", filters.accounts);

    const { data: purchasesData, error: purchaseError } = await purchaseQuery;
    if (purchaseError) throw new Error(purchaseError.message);
    const purchases = (purchasesData ?? []) as unknown as Array<{
      id: string;
      category_id: string | null;
      credit_card_id: string;
      categories: { name: string; color: string; icon: string | null } | null;
    }>;

    const purchaseById = new Map(purchases.map((p) => [p.id, p]));
    const purchaseIds = [...purchaseById.keys()];

    if (purchaseIds.length) {
      const { data: installments, error: installmentError } = await supabase
        .from("card_installments")
        .select("amount, competence, purchase_id")
        .in("purchase_id", purchaseIds)
        .gte("competence", filters.periodStart)
        .lte("competence", filters.periodEnd);
      if (installmentError) throw new Error(installmentError.message);

      for (const row of installments ?? []) {
        const purchase = purchaseById.get(row.purchase_id);
        entries.push({
          amount: row.amount,
          date: row.competence,
          type: "EXPENSE",
          categoryId: purchase?.category_id ?? null,
          categoryName: purchase?.categories?.name ?? "Sem categoria",
          categoryColor: purchase?.categories?.color ?? "#98989b",
          categoryIcon: purchase?.categories?.icon ?? null,
        });
      }
    }
  }

  return entries;
}

export async function getFinancialSummary(filters: DashboardFilters): Promise<FinancialSummaryDTO> {
  const supabase = await createClient();
  const user = await getUser();
  const entries = await fetchPeriodEntries(supabase, user.id, filters);

  const income = sumMoney(entries.filter((e) => e.type === "INCOME").map((e) => e.amount));
  const expense = sumMoney(entries.filter((e) => e.type === "EXPENSE").map((e) => e.amount));

  const accounts = await getAccounts();
  const relevantAccounts = filters.accounts?.length ? accounts.filter((a) => filters.accounts!.includes(a.id)) : accounts;
  const liquidAccounts = relevantAccounts.filter((a) => a.type !== "CREDIT_CARD");
  const balance = sumMoney(liquidAccounts.map((a) => a.balance));

  const adjustmentTotal = sumMoney(entries.filter((e) => e.categoryName === "Ajuste").map((e) => e.amount));
  const periodTotal = sumMoney([income, expense]);
  const adjustmentShare = periodTotal === 0 ? 0 : Math.round((adjustmentTotal / periodTotal) * 1000) / 10;

  return {
    balance,
    income,
    expense,
    result: subtractMoney(income, expense),
    adjustmentShare,
  };
}

export async function getMonthlyEvolution(filters: DashboardFilters): Promise<MonthlyEvolutionDTO[]> {
  const supabase = await createClient();
  const user = await getUser();
  const entries = await fetchPeriodEntries(supabase, user.id, filters);

  const months: string[] = [];
  let cursor = filters.periodStart.slice(0, 7);
  const endMonth = filters.periodEnd.slice(0, 7);
  while (cursor <= endMonth) {
    months.push(cursor);
    cursor = monthKey(addMonthsToIsoDate(`${cursor}-01`, 1));
  }

  return months.map((month) => {
    const monthEntries = entries.filter((e) => monthKey(e.date) === month);
    return {
      month: formatMonthLabel(month, true),
      income: sumMoney(monthEntries.filter((e) => e.type === "INCOME").map((e) => e.amount)),
      expense: sumMoney(monthEntries.filter((e) => e.type === "EXPENSE").map((e) => e.amount)),
    };
  });
}

/** Defaults to EXPENSE when no transactionType filter is set — a spending breakdown is the common case for a donut chart. */
export async function getCategoryDistribution(filters: DashboardFilters): Promise<CategoryDistributionDTO[]> {
  const supabase = await createClient();
  const user = await getUser();
  const effectiveFilters: DashboardFilters = { ...filters, transactionType: filters.transactionType ?? "EXPENSE" };
  const entries = await fetchPeriodEntries(supabase, user.id, effectiveFilters);

  const byCategory = new Map<string, { categoryId: string; categoryName: string; color: string; icon: string | null; amounts: number[] }>();
  for (const entry of entries) {
    const key = entry.categoryId ?? "uncategorized";
    const bucket = byCategory.get(key) ?? { categoryId: key, categoryName: entry.categoryName, color: entry.categoryColor, icon: entry.categoryIcon, amounts: [] };
    bucket.amounts.push(entry.amount);
    byCategory.set(key, bucket);
  }

  return [...byCategory.values()]
    .map((bucket) => ({ categoryId: bucket.categoryId, categoryName: bucket.categoryName, total: sumMoney(bucket.amounts), color: bucket.color, icon: bucket.icon }))
    .sort((a, b) => b.total - a.total);
}

export async function getCategoryComparison(filters: DashboardFilters): Promise<CategoryComparisonDTO[]> {
  const distribution = await getCategoryDistribution(filters);
  return distribution.map((d) => ({ categoryId: d.categoryId, categoryName: d.categoryName, total: d.total, color: d.color }));
}

export async function getTransactionsFiltered(filters: DashboardFilters): Promise<TransactionViewDTO[]> {
  const supabase = await createClient();
  const user = await getUser();

  let txQuery = supabase
    .from("transactions")
    .select(
      "id, date, description, type, amount, category_id, subcategory_id, origin_account_id, destination_account_id, categories(name), subcategories(name), origin:accounts!transactions_origin_account_id_fkey(name, type), destination:accounts!transactions_destination_account_id_fkey(name, type)"
    )
    .eq("user_id", user.id)
    .in("type", ["INCOME", "EXPENSE"])
    .gte("date", filters.periodStart)
    .lte("date", filters.periodEnd)
    .order("date", { ascending: false });

  if (filters.transactionType) txQuery = txQuery.eq("type", filters.transactionType);
  if (filters.uncategorizedOnly) txQuery = txQuery.is("category_id", null);
  else if (filters.categories?.length) txQuery = txQuery.in("category_id", filters.categories);
  if (filters.subcategories?.length) txQuery = txQuery.in("subcategory_id", filters.subcategories);
  if (filters.accounts?.length) {
    const list = filters.accounts.join(",");
    txQuery = txQuery.or(`origin_account_id.in.(${list}),destination_account_id.in.(${list})`);
  }

  const { data: transactionsData, error: txError } = await txQuery;
  if (txError) throw new Error(txError.message);
  const transactions = (transactionsData ?? []) as unknown as Array<{
    id: string;
    date: string;
    description: string | null;
    type: "INCOME" | "EXPENSE";
    amount: number;
    category_id: string | null;
    subcategory_id: string | null;
    origin_account_id: string | null;
    destination_account_id: string | null;
    categories: { name: string } | null;
    subcategories: { name: string } | null;
    origin: { name: string; type: AccountType } | null;
    destination: { name: string; type: AccountType } | null;
  }>;

  const results: TransactionViewDTO[] = transactions.map((row) => ({
    id: row.id,
    date: row.date,
    description: row.description ?? "",
    type: row.type,
    categoryId: row.category_id,
    category: row.categories?.name ?? "",
    subcategoryId: row.subcategory_id,
    subcategory: row.subcategories?.name ?? "",
    accountId: row.origin_account_id ?? row.destination_account_id,
    account: row.origin?.name ?? row.destination?.name ?? "",
    accountType: row.origin?.type ?? row.destination?.type ?? null,
    amount: row.amount,
    source: "transaction" as const,
  }));

  if (filters.transactionType === "INCOME") return results;

  let purchaseQuery = supabase
    .from("card_purchases")
    .select("id, description, category_id, subcategory_id, credit_card_id, categories(name), subcategories(name), accounts(name)")
    .eq("user_id", user.id);
  if (filters.uncategorizedOnly) purchaseQuery = purchaseQuery.is("category_id", null);
  else if (filters.categories?.length) purchaseQuery = purchaseQuery.in("category_id", filters.categories);
  if (filters.subcategories?.length) purchaseQuery = purchaseQuery.in("subcategory_id", filters.subcategories);
  if (filters.accounts?.length) purchaseQuery = purchaseQuery.in("credit_card_id", filters.accounts);

  const { data: purchasesData, error: purchaseError } = await purchaseQuery;
  if (purchaseError) throw new Error(purchaseError.message);
  const purchases = (purchasesData ?? []) as unknown as Array<{
    id: string;
    description: string | null;
    category_id: string | null;
    subcategory_id: string | null;
    credit_card_id: string;
    categories: { name: string } | null;
    subcategories: { name: string } | null;
    accounts: { name: string } | null;
  }>;

  const purchaseIds = purchases.map((p) => p.id);
  if (!purchaseIds.length) return results;

  const { data: installments, error: installmentError } = await supabase
    .from("card_installments")
    .select("id, amount, competence, purchase_id")
    .in("purchase_id", purchaseIds)
    .gte("competence", filters.periodStart)
    .lte("competence", filters.periodEnd);
  if (installmentError) throw new Error(installmentError.message);

  const purchaseById = new Map(purchases.map((p) => [p.id, p]));
  for (const row of installments ?? []) {
    const purchase = purchaseById.get(row.purchase_id);
    if (!purchase) continue;
    results.push({
      id: row.id,
      date: row.competence,
      description: purchase.description ?? "",
      type: "EXPENSE",
      categoryId: purchase.category_id,
      category: purchase.categories?.name ?? "",
      subcategoryId: purchase.subcategory_id,
      subcategory: purchase.subcategories?.name ?? "",
      accountId: purchase.credit_card_id,
      account: purchase.accounts?.name ?? "",
      accountType: "CREDIT_CARD" as const,
      amount: row.amount,
      source: "installment" as const,
      purchaseId: purchase.id,
    });
  }

  return results.sort((a, b) => (a.date < b.date ? 1 : -1));
}
