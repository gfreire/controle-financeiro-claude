import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/getUser";
import { splitInstallments, sumMoney, subtractMoney } from "@/lib/utils/money";
import { calculateInstallmentCompetences, calculateInstallmentCompetencesFromAnchorMonth } from "@/lib/utils/date";
import { monthKey, endOfMonth } from "@/lib/utils/date";
import type { CardPurchaseInput, CardPaymentInput } from "@/lib/validations/cards";
import type { CardInstallmentDTO, CardPurchaseDTO } from "@/types/dto";

async function getCardCycle(supabase: Awaited<ReturnType<typeof createClient>>, creditCardId: string) {
  const { data, error } = await supabase.from("credit_cards").select("closing_day, due_day").eq("account_id", creditCardId).single();
  if (error) throw new Error(error.message);
  return data;
}

function resolveCompetences(
  cycle: { closing_day: number; due_day: number },
  purchaseDate: string,
  installments: number,
  firstCompetenceMonth?: string
): string[] {
  return firstCompetenceMonth
    ? calculateInstallmentCompetencesFromAnchorMonth(firstCompetenceMonth, cycle.due_day, installments)
    : calculateInstallmentCompetences(purchaseDate, cycle.closing_day, cycle.due_day, installments);
}

export async function createCardPurchase(input: CardPurchaseInput): Promise<string> {
  const supabase = await createClient();
  const user = await getUser();
  const cycle = await getCardCycle(supabase, input.creditCardId);

  const { data: purchase, error } = await supabase
    .from("card_purchases")
    .insert({
      user_id: user.id,
      credit_card_id: input.creditCardId,
      amount: input.amount,
      purchase_date: input.purchaseDate,
      description: input.description ?? null,
      category_id: input.categoryId ?? null,
      subcategory_id: input.subcategoryId ?? null,
      installments: input.installments,
      is_reservoir: input.isReservoir ?? false,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const amounts = splitInstallments(input.amount, input.installments);
  const competences = resolveCompetences(cycle, input.purchaseDate, input.installments, input.firstCompetenceMonth);

  const installmentRows = amounts.map((amount, index) => ({
    purchase_id: purchase.id,
    credit_card_id: input.creditCardId,
    competence: competences[index],
    amount,
  }));

  const { error: installmentsError } = await supabase.from("card_installments").insert(installmentRows);
  if (installmentsError) throw new Error(installmentsError.message);

  return purchase.id;
}

/**
 * Editing a purchase rolls back and re-registers: every installment is deleted and regenerated
 * from the updated values (amount, date, installment count, or first-competence-month override),
 * respecting the rounding rule — never patched installment-by-installment.
 */
export async function updateCardPurchase(id: string, input: Partial<CardPurchaseInput>): Promise<void> {
  const supabase = await createClient();

  const { data: current, error: currentError } = await supabase.from("card_purchases").select("*").eq("id", id).single();
  if (currentError) throw new Error(currentError.message);

  const merged = {
    amount: input.amount ?? current.amount,
    purchaseDate: input.purchaseDate ?? current.purchase_date,
    installments: input.installments ?? current.installments,
    creditCardId: input.creditCardId ?? current.credit_card_id,
    description: input.description ?? current.description,
    categoryId: input.categoryId ?? current.category_id,
    subcategoryId: input.subcategoryId ?? current.subcategory_id,
  };

  const { error } = await supabase
    .from("card_purchases")
    .update({
      amount: merged.amount,
      purchase_date: merged.purchaseDate,
      installments: merged.installments,
      credit_card_id: merged.creditCardId,
      description: merged.description,
      category_id: merged.categoryId,
      subcategory_id: merged.subcategoryId,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  const needsRegeneration =
    input.amount !== undefined ||
    input.purchaseDate !== undefined ||
    input.installments !== undefined ||
    input.creditCardId !== undefined ||
    input.firstCompetenceMonth !== undefined;
  if (!needsRegeneration) return;

  const cycle = await getCardCycle(supabase, merged.creditCardId);
  const amounts = splitInstallments(merged.amount, merged.installments);
  const competences = resolveCompetences(cycle, merged.purchaseDate, merged.installments, input.firstCompetenceMonth);

  const { error: deleteError } = await supabase.from("card_installments").delete().eq("purchase_id", id);
  if (deleteError) throw new Error(deleteError.message);

  const installmentRows = amounts.map((amount, index) => ({
    purchase_id: id,
    credit_card_id: merged.creditCardId,
    competence: competences[index],
    amount,
  }));
  const { error: insertError } = await supabase.from("card_installments").insert(installmentRows);
  if (insertError) throw new Error(insertError.message);
}

export async function deleteCardPurchase(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("card_purchases").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getCardPurchases(cardId: string): Promise<CardPurchaseDTO[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("card_purchases")
    .select("*, categories(name), subcategories(name)")
    .eq("credit_card_id", cardId)
    .order("purchase_date", { ascending: false });
  if (error) throw new Error(error.message);

  const purchaseIds = (data ?? []).map((row) => row.id);
  const firstCompetenceByPurchase = new Map<string, string>();
  if (purchaseIds.length) {
    const { data: installments, error: installmentError } = await supabase
      .from("card_installments")
      .select("purchase_id, competence")
      .in("purchase_id", purchaseIds)
      .order("competence", { ascending: true });
    if (installmentError) throw new Error(installmentError.message);
    for (const row of installments ?? []) {
      if (!firstCompetenceByPurchase.has(row.purchase_id)) {
        firstCompetenceByPurchase.set(row.purchase_id, monthKey(row.competence));
      }
    }
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    creditCardId: row.credit_card_id,
    description: row.description ?? "",
    totalAmount: row.amount,
    installmentsCount: row.installments,
    purchaseDate: row.purchase_date,
    firstCompetenceMonth: firstCompetenceByPurchase.get(row.id) ?? monthKey(row.purchase_date),
    categoryId: row.category_id,
    categoryName: row.categories?.name ?? null,
    subcategoryId: row.subcategory_id,
    subcategoryName: row.subcategories?.name ?? null,
  }));
}

/**
 * installment_number/total_installments are derived: ordered by competence within a purchase,
 * never stored columns. Numbering must come from EVERY installment of a purchase, not just the
 * ones inside the requested period filter — otherwise a purchase whose 1st/2nd installments fall
 * before the filtered window shows its 3rd installment mislabeled as "1/N" (bug fixed here).
 */
export async function getCardInstallments(cardId: string, filters: { periodStart?: string; periodEnd?: string } = {}): Promise<CardInstallmentDTO[]> {
  const supabase = await createClient();
  let query = supabase
    .from("card_installments")
    .select("*, card_purchases(description, installments)")
    .eq("credit_card_id", cardId)
    .order("competence", { ascending: true });
  if (filters.periodStart) query = query.gte("competence", filters.periodStart);
  if (filters.periodEnd) query = query.lte("competence", filters.periodEnd);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const purchaseIds = [...new Set((data ?? []).map((row) => row.purchase_id))];
  const { data: allInstallments, error: allError } =
    purchaseIds.length > 0
      ? await supabase.from("card_installments").select("id, purchase_id, competence").in("purchase_id", purchaseIds)
      : { data: [] as { id: string; purchase_id: string; competence: string }[], error: null };
  if (allError) throw new Error(allError.message);

  const byPurchase = new Map<string, typeof allInstallments>();
  for (const row of allInstallments ?? []) {
    const list = byPurchase.get(row.purchase_id) ?? [];
    list.push(row);
    byPurchase.set(row.purchase_id, list);
  }

  const numbered = new Map<string, number>();
  for (const [, rows] of byPurchase) {
    const sorted = [...rows].sort((a, b) => (a.competence < b.competence ? -1 : 1));
    sorted.forEach((row, index) => numbered.set(row.id, index + 1));
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    purchaseId: row.purchase_id,
    installmentNumber: numbered.get(row.id) ?? 1,
    totalInstallments: row.card_purchases?.installments ?? 1,
    amount: row.amount,
    competenceMonth: monthKey(row.competence),
    description: row.card_purchases?.description ?? "",
  }));
}

/** Sum of installments due through (and including) `throughMonth`, minus payments already made — what a "pay the bill" action should actually suggest, not the full lifetime balance including installments still in the future. */
export async function getCardBalanceThroughMonth(creditCardId: string, throughMonth: string): Promise<number> {
  const supabase = await createClient();
  const periodEnd = endOfMonth(`${throughMonth}-01`);

  const [{ data: installments }, { data: payments }] = await Promise.all([
    supabase.from("card_installments").select("amount").eq("credit_card_id", creditCardId).lte("competence", periodEnd),
    supabase.from("card_payments").select("amount").eq("credit_card_id", creditCardId),
  ]);
  const totalInstallments = sumMoney((installments ?? []).map((i) => i.amount));
  const totalPayments = sumMoney((payments ?? []).map((p) => p.amount));
  return Math.max(0, subtractMoney(totalInstallments, totalPayments));
}

/** Pays the card bill: creates both a CREDIT_CARD_PAYMENT transaction and the linked card_payments metadata row. */
export async function registerCardPayment(input: CardPaymentInput): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();

  const { data: transaction, error: txError } = await supabase
    .from("transactions")
    .insert({
      user_id: user.id,
      type: "CREDIT_CARD_PAYMENT",
      origin_account_id: input.accountId,
      destination_account_id: input.creditCardId,
      amount: input.amount,
      date: input.paymentDate,
    })
    .select("id")
    .single();
  if (txError) throw new Error(txError.message);

  const { error: paymentError } = await supabase.from("card_payments").insert({
    user_id: user.id,
    credit_card_id: input.creditCardId,
    account_id: input.accountId,
    transaction_id: transaction.id,
    amount: input.amount,
    payment_date: input.paymentDate,
  });
  if (paymentError) throw new Error(paymentError.message);
}
