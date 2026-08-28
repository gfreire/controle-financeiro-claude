import { cache } from "react";
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
  // "liquid" = only CASH/BANK transactions; "cards" = only card_installments. A plain EXPENSE
  // transaction is never posted against a CREDIT_CARD account (that always flows through
  // card_purchases/card_installments instead), so this cleanly splits the two source queries
  // below without needing per-account-id filtering. See DashboardFilters.source.
  const includeLiquid = filters.source !== "cards";
  const includeCards = filters.source !== "liquid";

  if (includeLiquid) {
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
  }

  // Card installments are always EXPENSE — skip entirely when the caller asked for INCOME only.
  if (includeCards && filters.transactionType !== "INCOME") {
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

  // Card refunds (AI_CONTEXT.md "Estorno") — a credit against the card's balance, always tagged
  // with the real "Estorno" INCOME system category, counted for the month it actually happened
  // (refund_date), never the original purchase's competence. Unlike retroactive/paid-before-system
  // income below, this always has a real categoryId, so it's folded directly into `entries` instead
  // of a separate computed-only bucket — category charts can show "Estorno" like any other income.
  // Skipped for uncategorizedOnly/subcategory filters since a refund never matches either.
  if (includeCards && filters.transactionType !== "EXPENSE" && !filters.uncategorizedOnly && !filters.subcategories?.length) {
    let refundQuery = supabase
      .from("card_refunds")
      .select("amount, refund_date, category_id, credit_card_id, categories(name, color, icon)")
      .eq("user_id", userId)
      .gte("refund_date", filters.periodStart)
      .lte("refund_date", filters.periodEnd);
    if (filters.categories?.length) refundQuery = refundQuery.in("category_id", filters.categories);
    if (filters.accounts?.length) refundQuery = refundQuery.in("credit_card_id", filters.accounts);

    const { data: refundsData, error: refundError } = await refundQuery;
    if (refundError) throw new Error(refundError.message);
    const refunds = (refundsData ?? []) as unknown as Array<{
      amount: number;
      refund_date: string;
      category_id: string;
      categories: { name: string; color: string; icon: string | null } | null;
    }>;
    for (const row of refunds) {
      entries.push({
        amount: row.amount,
        date: row.refund_date,
        type: "INCOME",
        categoryId: row.category_id,
        categoryName: row.categories?.name ?? "Estorno",
        categoryColor: row.categories?.color ?? "#0ea5e9",
        categoryIcon: row.categories?.icon ?? null,
      });
    }
  }

  // Backfilled/retroactive card purchases: installments flagged `paid_before_system` were settled
  // outside the system with real money but no tracked source (see AI_CONTEXT.md "Compras
  // retroativas"). They already count as EXPENSE normally through the card_installments block
  // above — no flag filter there. Their amount ALSO counts as INCOME for their competence month,
  // now bucketed under the `is_system` "Compras retroativas" INCOME category (migration 0030) the
  // same way "Estorno"/"Ajuste" income carries a real system category. Before 0030 this was a
  // computed-only figure fed straight into getFinancialSummary/getMonthlyEvolution and kept out
  // of the category charts entirely; folding it into `entries` here is what makes the income
  // donut/bars reconcile with the monthly-evolution income total.
  // Same guards as the refund block (income side only; a retroactive-income entry never matches
  // an uncategorized or subcategory filter). The category filter now matches the system category
  // id, not the purchase's own EXPENSE category — filtering the dashboard by a spending category
  // no longer pulls in that category's retroactive income, and filtering by "Compras retroativas"
  // shows all of it, consistent with treating it as a real INCOME category.
  const wantsRetroactiveIncome =
    includeCards &&
    filters.transactionType !== "EXPENSE" &&
    !filters.uncategorizedOnly &&
    !filters.subcategories?.length;

  if (wantsRetroactiveIncome) {
    const retroCategory = await getRetroactiveIncomeCategory();
    if (!filters.categories?.length || filters.categories.includes(retroCategory.id)) {
      let retroPurchaseQuery = supabase.from("card_purchases").select("id, credit_card_id").eq("user_id", userId);
      if (filters.accounts?.length) retroPurchaseQuery = retroPurchaseQuery.in("credit_card_id", filters.accounts);

      const { data: retroPurchasesData, error: retroPurchaseError } = await retroPurchaseQuery;
      if (retroPurchaseError) throw new Error(retroPurchaseError.message);
      const retroPurchaseIds = (retroPurchasesData ?? []).map((p) => p.id);

      if (retroPurchaseIds.length) {
        const { data: retroInstallments, error: retroInstallmentError } = await supabase
          .from("card_installments")
          .select("amount, competence")
          .in("purchase_id", retroPurchaseIds)
          .eq("paid_before_system", true)
          .gte("competence", filters.periodStart)
          .lte("competence", filters.periodEnd);
        if (retroInstallmentError) throw new Error(retroInstallmentError.message);

        for (const row of retroInstallments ?? []) {
          entries.push({
            amount: row.amount,
            date: row.competence,
            type: "INCOME",
            categoryId: retroCategory.id,
            categoryName: retroCategory.name,
            categoryColor: retroCategory.color,
            categoryIcon: retroCategory.icon,
          });
        }
      }
    }
  }

  return entries;
}

/**
 * The `is_system` INCOME category that retroactive/`paid_before_system` installment income is
 * bucketed under (migration 0030) — mirrors how `getEstornoCategoryIds` resolves the "Estorno"
 * pair. Cached for the request: `fetchPeriodEntries` runs once per dashboard service call and a
 * single dashboard render calls several of them.
 */
const getRetroactiveIncomeCategory = cache(async (): Promise<{
  id: string;
  name: string;
  color: string;
  icon: string | null;
}> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, color, icon")
    .eq("is_system", true)
    .eq("name", "Compras retroativas")
    .eq("type", "INCOME")
    .single();
  if (error) throw new Error(error.message);
  return data as { id: string; name: string; color: string; icon: string | null };
});

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
  const refundTotal = sumMoney(entries.filter((e) => e.categoryName === "Estorno").map((e) => e.amount));
  const retroactiveIncomeTotal = sumMoney(
    entries.filter((e) => e.categoryName === "Compras retroativas").map((e) => e.amount)
  );
  return {
    balance,
    income,
    expense,
    result: subtractMoney(income, expense),
    // Absolute R$ values, not % shares — the dashboard badges show currency now (2026-08-28),
    // percentages were hard to parse at a glance.
    adjustmentAmount: adjustmentTotal,
    retroactiveIncomeAmount: retroactiveIncomeTotal,
    refundAmount: refundTotal,
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
    originAccountId: row.origin_account_id,
    destinationAccountId: row.destination_account_id,
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
    .select("id, amount, competence, purchase_id, paid_before_system")
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
      paidBeforeSystem: row.paid_before_system,
    });
  }

  return results.sort((a, b) => (a.date < b.date ? 1 : -1));
}
