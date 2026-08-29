import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/getUser";
import { sumMoney, subtractMoney, addMoney } from "@/lib/utils/money";
import { monthKey, formatMonthLabel, addMonthsToIsoDate, startOfMonth, endOfMonth, todayIso } from "@/lib/utils/date";
import { getAccounts } from "./accounts.service";
import { getCardSummary } from "./cards.service";
import { getFixedExpenses } from "./fixed-expenses.service";
import { getDebts } from "./debts.service";
import type {
  DashboardFilters,
  FinancialSummaryDTO,
  MonthlyEvolutionDTO,
  CategoryDistributionDTO,
  TransactionViewDTO,
  MonthObligationItemDTO,
  MonthObligationsDTO,
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
  filters: DashboardFilters,
  /**
   * When set ("YYYY-MM"), the unpaid projected obligations of that month (despesas programadas /
   * INSTALLMENT_PLAN / OVERDUE_BILL not yet paid) are appended as EXPENSE entries — see
   * `fetchUnpaidObligationEntries`. Callers pass the single viewed month; for the 15-month
   * evolution window the entries' competence date buckets them into that one month's bar.
   */
  obligationsMonth?: string
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

  if (obligationsMonth) {
    entries.push(...(await fetchUnpaidObligationEntries(supabase, filters, obligationsMonth)));
  }

  return entries;
}

/**
 * Unpaid projected obligations for a single month, returned as EXPENSE `Entry`s so they flow
 * into the dashboard's expense totals (DESPESAS card, Balanço Mensal, "Despesas por categoria"
 * donut, and the viewed-month bar of Evolução mensal) exactly like a real transaction would.
 *
 * Mirrors the "Despesas do mês" card's rule (`getCurrentMonthObligations`): every despesa
 * programada not yet paid this month (`plannedAmount`), every INSTALLMENT_PLAN debt whose
 * competence for `month` isn't covered by payments (`monthlyAmount`), every OVERDUE_BILL debt
 * (`remainingBalance`). This is a
 * deliberate, documented break from "Money Reality Rules" for the dashboard's expense side —
 * decided 2026-08-28, see AI_CONTEXT.md "Despesas do mês (dashboard)".
 *
 * Card invoices are NOT projected here — real `card_installments` already carry the full invoice
 * by competence, paid or not, so the DESPESAS card ends up reconciling exactly with the
 * "Despesas do mês" card's `total`.
 *
 * Skipped whenever a filter makes a projection meaningless: an account filter (a projection
 * isn't posted against any account), the expense-source toggle set to liquid/cards, or an
 * INCOME-only view. The category / subcategory / uncategorized filters are honoured the same way
 * the real-entry queries are (debts have no subcategory, so a subcategory filter drops them).
 */
async function fetchUnpaidObligationEntries(
  supabase: Awaited<ReturnType<typeof createClient>>,
  filters: DashboardFilters,
  month: string
): Promise<Entry[]> {
  if (filters.transactionType === "INCOME") return [];
  if (filters.accounts?.length) return [];
  if (filters.source === "liquid" || filters.source === "cards") return [];

  const [fixedExpenses, debts] = await Promise.all([getFixedExpenses(`${month}-01`), getDebts()]);

  type Raw = { amount: number; categoryId: string | null; subcategoryId: string | null };
  const raws: Raw[] = [];

  for (const fe of fixedExpenses) {
    if (fe.isPaidThisMonth) continue;
    raws.push({ amount: fe.plannedAmount, categoryId: fe.categoryId, subcategoryId: fe.subcategoryId ?? null });
  }
  for (const debt of debts) {
    if (debt.side !== "PAYABLE" || debt.kind === "PERSONAL") continue;
    if (debt.kind === "INSTALLMENT_PLAN") {
      // Competence-anchored, not calendar-month: an installment counts as owed for `month` only
      // once the plan has started and that competence isn't already covered by payments
      // (oldest-first). See AI_CONTEXT.md "Parcelamento Programado — competência e adiantado/atrasado".
      if (debt.startCompetence && month < debt.startCompetence) continue;
      if (debt.paidThroughCompetence && month <= debt.paidThroughCompetence) continue;
      raws.push({ amount: debt.monthlyAmount ?? debt.remainingBalance, categoryId: debt.defaultCategoryId ?? null, subcategoryId: null });
    } else {
      // OVERDUE_BILL — always outstanding
      raws.push({ amount: debt.remainingBalance, categoryId: debt.defaultCategoryId ?? null, subcategoryId: null });
    }
  }

  let filtered = raws.filter((r) => r.amount > 0);
  if (filters.uncategorizedOnly) filtered = filtered.filter((r) => r.categoryId === null);
  else if (filters.categories?.length) filtered = filtered.filter((r) => r.categoryId !== null && filters.categories!.includes(r.categoryId));
  if (filters.subcategories?.length) filtered = filtered.filter((r) => r.subcategoryId !== null && filters.subcategories!.includes(r.subcategoryId));
  if (!filtered.length) return [];

  const catIds = [...new Set(filtered.map((r) => r.categoryId).filter((v): v is string => v !== null))];
  const catById = new Map<string, { name: string; color: string; icon: string | null }>();
  if (catIds.length) {
    const { data, error } = await supabase.from("categories").select("id, name, color, icon").in("id", catIds);
    if (error) throw new Error(error.message);
    for (const c of (data ?? []) as Array<{ id: string; name: string; color: string; icon: string | null }>) {
      catById.set(c.id, { name: c.name, color: c.color, icon: c.icon });
    }
  }

  const date = `${month}-01`;
  return filtered.map((r) => {
    const cat = r.categoryId ? catById.get(r.categoryId) : undefined;
    return {
      amount: r.amount,
      date,
      type: "EXPENSE" as const,
      categoryId: r.categoryId,
      categoryName: cat?.name ?? "Sem categoria",
      categoryColor: cat?.color ?? "#98989b",
      categoryIcon: cat?.icon ?? null,
    };
  });
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

export async function getFinancialSummary(
  filters: DashboardFilters,
  obligationsMonth?: string
): Promise<FinancialSummaryDTO> {
  const supabase = await createClient();
  const user = await getUser();
  const entries = await fetchPeriodEntries(supabase, user.id, filters, obligationsMonth);

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

export async function getMonthlyEvolution(
  filters: DashboardFilters,
  obligationsMonth?: string
): Promise<MonthlyEvolutionDTO[]> {
  const supabase = await createClient();
  const user = await getUser();
  // Obligation entries carry `${obligationsMonth}-01` as their date, so they bucket into that
  // single month's bar (the viewed month) — the other months in the 15-month window stay
  // actuals-only, which keeps the viewed month's bar reconciled with the category donut.
  const entries = await fetchPeriodEntries(supabase, user.id, filters, obligationsMonth);

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
export async function getCategoryDistribution(
  filters: DashboardFilters,
  obligationsMonth?: string
): Promise<CategoryDistributionDTO[]> {
  const supabase = await createClient();
  const user = await getUser();
  const effectiveFilters: DashboardFilters = { ...filters, transactionType: filters.transactionType ?? "EXPENSE" };
  const entries = await fetchPeriodEntries(supabase, user.id, effectiveFilters, obligationsMonth);

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

/**
 * "Despesas de {mês}" dashboard card — a calendar month's spending, split into what's already
 * settled (`paidTotal`) and what still has to be paid (`items`, one per open commitment).
 * Follows the dashboard's viewed month (`month`, defaulting to today's real month when omitted)
 * so it moves along with the rest of the page's period filter instead of staying pinned to today.
 * INSTALLMENT_PLAN debts are judged by competence (`startCompetence`/`paidThroughCompetence` from
 * `getDebts()`, both month-independent), so they're correct for any browsed month. OVERDUE_BILL,
 * which has no competence concept, still just shows as always-outstanding regardless of month.
 *
 * `total` = `paidTotal + remainingTotal` = "despesas realizadas do mês + o que ainda falta
 * pagar". Since 2026-08-28 the DESPESAS summary card folds in the same unpaid despesas
 * programadas / dívidas programadas projection (via `fetchUnpaidObligationEntries`), so `total`
 * now reconciles exactly with DESPESAS — both are real EXPENSE by competence plus the identical
 * set of unpaid projections.
 *
 * Card spend is counted BY COMPETENCE, same as every other analytic (getCardSummary's
 * `currentMonthInvoice`/`currentMonthPaidAmount`), NOT by outstanding balance — an earlier
 * version used `getCardBalanceThroughMonth` and undercounted the month whenever a card's
 * installments hadn't been billed/paid yet. Each card's still-unpaid slice of this month's
 * invoice (`currentMonthInvoice - currentMonthPaidAmount`) is one "Fatura {cartão}" item; the
 * paid slice goes into `paidTotal`.
 *
 * `paidTotal` = every EXPENSE transaction dated this month (regular spend, plus bank/cash-paid
 * despesas programadas and debt payments via linked transaction) + Σ `currentMonthPaidAmount`
 * (the paid portion of each card's current-month invoice). CREDIT_CARD_PAYMENT transactions are
 * deliberately NOT summed here — that would double-count against the by-competence card figure
 * (a payment made this month usually settles a *prior* month's invoice anyway).
 *
 * Self-contained (does its own fetches) so all aggregation stays in the service — the redundancy
 * with the page's own getFixedExpenses/getDebts/getAccounts calls is small (month-scoped, and
 * getOptionalUser is request-cached).
 */
export async function getCurrentMonthObligations(
  month: string = monthKey(todayIso())
): Promise<MonthObligationsDTO> {
  const supabase = await createClient();
  const user = await getUser();
  const monthStart = startOfMonth(`${month}-01`);
  const monthEnd = endOfMonth(`${month}-01`);

  const accounts = await getAccounts();
  const cards = accounts.filter((a) => a.type === "CREDIT_CARD");

  const [cardSummaries, fixedExpenses, debts, paidResult] = await Promise.all([
    Promise.all(cards.map(async (card) => ({ card, summary: await getCardSummary(card.id, month, card.creditLimit ?? null) }))),
    getFixedExpenses(`${month}-01`),
    getDebts(),
    supabase
      .from("transactions")
      .select("amount")
      .eq("user_id", user.id)
      .eq("type", "EXPENSE")
      .gte("date", monthStart)
      .lte("date", monthEnd),
  ]);
  if (paidResult.error) throw new Error(paidResult.error.message);

  const items: MonthObligationItemDTO[] = [];

  for (const { card, summary } of cardSummaries) {
    const unpaid = subtractMoney(summary.currentMonthInvoice, summary.currentMonthPaidAmount);
    if (unpaid > 0) {
      items.push({ id: card.id, kind: "CARD", description: `Fatura ${card.name}`, amount: unpaid, dueDay: card.dueDay });
    }
  }
  for (const fe of fixedExpenses) {
    if (!fe.isPaidThisMonth) {
      items.push({ id: fe.id, kind: "FIXED_EXPENSE", description: fe.name, amount: fe.plannedAmount, dueDay: fe.dueDay });
    }
  }
  for (const debt of debts) {
    if (debt.side !== "PAYABLE" || debt.kind === "PERSONAL") continue;
    if (debt.kind === "INSTALLMENT_PLAN") {
      // Competence-anchored (see fetchUnpaidObligationEntries above): shown for `month` only once
      // the plan has started and that competence isn't covered by payments (oldest-first).
      const started = !debt.startCompetence || month >= debt.startCompetence;
      const covered = debt.paidThroughCompetence !== undefined && month <= debt.paidThroughCompetence;
      if (started && !covered) {
        items.push({
          id: debt.id,
          kind: "DEBT",
          description: debt.agent,
          amount: debt.monthlyAmount ?? debt.remainingBalance,
          dueDay: debt.dueDay,
        });
      }
    } else {
      // OVERDUE_BILL — always outstanding, no paidThisMonth / dueDay concept
      items.push({ id: debt.id, kind: "DEBT", description: debt.agent, amount: debt.remainingBalance });
    }
  }

  items.sort((a, b) => b.amount - a.amount);

  const paidTotal = sumMoney([
    ...(paidResult.data ?? []).map((r) => r.amount),
    ...cardSummaries.map(({ summary }) => summary.currentMonthPaidAmount),
  ]);
  const remainingTotal = sumMoney(items.map((i) => i.amount));
  const total = addMoney(paidTotal, remainingTotal);

  return { month, items, paidTotal, remainingTotal, total };
}

/**
 * Default month the Dashboard lands on when the user hasn't picked one (no `?month=` in the URL,
 * and the default "month" preset). Mirrors `getDefaultCardsMonth`'s practicality tweak: if every
 * expense of the current real month is already paid (`getCurrentMonthObligations(currentMonth)`
 * has nothing left in `remainingTotal`), jump straight to next month — but only when next month
 * actually has expenses to look at; with next month empty, stay on the current month.
 *
 * Reuses `getCurrentMonthObligations` so "todas as despesas já foram pagas" means exactly what
 * the "Despesas de {mês}" card shows. When the current month still has something unpaid (the
 * common case) this is a single extra call.
 */
export async function getDefaultDashboardMonth(): Promise<string> {
  const currentMonth = monthKey(todayIso());
  const current = await getCurrentMonthObligations(currentMonth);
  if (current.remainingTotal > 0) return currentMonth;

  const nextMonth = monthKey(addMonthsToIsoDate(`${currentMonth}-01`, 1));
  const next = await getCurrentMonthObligations(nextMonth);
  return next.total > 0 ? nextMonth : currentMonth;
}
