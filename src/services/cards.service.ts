import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/getUser";
import { splitInstallments, sumMoney, subtractMoney, addMoney } from "@/lib/utils/money";
import { calculateInstallmentCompetences, calculateInstallmentCompetencesFromAnchorMonth } from "@/lib/utils/date";
import { monthKey, startOfMonth, endOfMonth, todayIso, addMonthsToIsoDate, formatMonthLabel } from "@/lib/utils/date";
import type { CardPurchaseInput, CardPaymentInput } from "@/lib/validations/cards";
import type { CardInstallmentDTO, CardMonthlyEvolutionDTO, CardPurchaseDTO, CardSummaryDTO } from "@/types/dto";

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

/**
 * Backfilled/retroactive purchase: every installment whose competence falls at or before
 * `paidThroughCompetence` ("já paguei até este mês") is already settled outside the system —
 * always a contiguous prefix of the generated installments, never an arbitrary subset. See
 * AI_CONTEXT.md "Compras retroativas".
 */
function resolvePaidBeforeSystemFlags(competences: string[], paidThroughCompetence?: string | null): boolean[] {
  if (!paidThroughCompetence) return competences.map(() => false);
  return competences.map((c) => monthKey(c) <= paidThroughCompetence);
}

export async function createCardPurchase(input: CardPurchaseInput): Promise<string> {
  const supabase = await createClient();
  const user = await getUser();
  const cycle = await getCardCycle(supabase, input.creditCardId);

  if (input.paidThroughCompetence && input.paidThroughCompetence > monthKey(todayIso())) {
    throw new Error("'Pago até' não pode ser um mês futuro.");
  }

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
      fixed_expense_id: input.fixedExpenseId ?? null,
      paid_through_competence: input.paidThroughCompetence ? `${input.paidThroughCompetence}-01` : null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const amounts = splitInstallments(input.amount, input.installments);
  const competences = resolveCompetences(cycle, input.purchaseDate, input.installments, input.firstCompetenceMonth);
  const paidBeforeSystemFlags = resolvePaidBeforeSystemFlags(competences, input.paidThroughCompetence);

  const installmentRows = amounts.map((amount, index) => ({
    purchase_id: purchase.id,
    credit_card_id: input.creditCardId,
    competence: competences[index],
    amount,
    paid_before_system: paidBeforeSystemFlags[index],
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

  // categoryId/subcategoryId use `!== undefined` (not `??`) because `null` is a meaningful,
  // intentional value here — "clear this field" — and `??` would silently discard it in favor
  // of the current value, indistinguishable from the field simply not being part of this update.
  const merged = {
    amount: input.amount ?? current.amount,
    purchaseDate: input.purchaseDate ?? current.purchase_date,
    installments: input.installments ?? current.installments,
    creditCardId: input.creditCardId ?? current.credit_card_id,
    description: input.description ?? current.description,
    categoryId: input.categoryId !== undefined ? input.categoryId : current.category_id,
    subcategoryId: input.subcategoryId !== undefined ? input.subcategoryId : current.subcategory_id,
    paidThroughCompetence:
      input.paidThroughCompetence !== undefined
        ? input.paidThroughCompetence
        : current.paid_through_competence
          ? monthKey(current.paid_through_competence)
          : null,
  };

  if (merged.paidThroughCompetence && merged.paidThroughCompetence > monthKey(todayIso())) {
    throw new Error("'Pago até' não pode ser um mês futuro.");
  }

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
      paid_through_competence: merged.paidThroughCompetence ? `${merged.paidThroughCompetence}-01` : null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  const needsRegeneration =
    input.amount !== undefined ||
    input.purchaseDate !== undefined ||
    input.installments !== undefined ||
    input.creditCardId !== undefined ||
    input.firstCompetenceMonth !== undefined ||
    input.paidThroughCompetence !== undefined;
  if (!needsRegeneration) return;

  const cycle = await getCardCycle(supabase, merged.creditCardId);
  const amounts = splitInstallments(merged.amount, merged.installments);
  const competences = resolveCompetences(cycle, merged.purchaseDate, merged.installments, input.firstCompetenceMonth);
  const paidBeforeSystemFlags = resolvePaidBeforeSystemFlags(competences, merged.paidThroughCompetence);

  const { error: deleteError } = await supabase.from("card_installments").delete().eq("purchase_id", id);
  if (deleteError) throw new Error(deleteError.message);

  const installmentRows = amounts.map((amount, index) => ({
    purchase_id: id,
    credit_card_id: merged.creditCardId,
    competence: competences[index],
    amount,
    paid_before_system: paidBeforeSystemFlags[index],
  }));
  const { error: insertError } = await supabase.from("card_installments").insert(installmentRows);
  if (insertError) throw new Error(insertError.message);
}

export async function deleteCardPurchase(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("card_purchases").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

async function getEstornoCategoryIds(supabase: Awaited<ReturnType<typeof createClient>>) {
  const [{ data: expense, error: expenseError }, { data: income, error: incomeError }] = await Promise.all([
    supabase.from("categories").select("id").eq("is_system", true).eq("name", "Estorno").eq("type", "EXPENSE").single(),
    supabase.from("categories").select("id").eq("is_system", true).eq("name", "Estorno").eq("type", "INCOME").single(),
  ]);
  if (expenseError) throw new Error(expenseError.message);
  if (incomeError) throw new Error(incomeError.message);
  return { expenseCategoryId: expense.id as string, incomeCategoryId: income.id as string };
}

/**
 * Estorno integral de uma compra no cartão (AI_CONTEXT.md "Estorno") — só reembolso total, nunca
 * parcial. Três coisas acontecem: (1) a compra é reclassificada para a categoria system "Estorno"
 * (EXPENSE), tirando-a da categoria original em qualquer gráfico/soma por categoria; (2) toda
 * parcela ainda não faturada (competence depois da fatura que estava aberta no momento do
 * estorno) é adiantada pra essa mesma competência — replica o que o emissor real faz: uma compra
 * parcelada estornada não continua pingando pelos meses futuros originais, todo o restante é
 * jogado de uma vez na fatura aberta na hora do estorno (comportamento observado pelo usuário
 * 2026-08-23 num estorno real do cartão Amazon — a 1ª parcela já faturada/paga ficou intacta, as
 * demais foram todas puxadas pra fatura em aberto); (3) um `card_refunds` reduz o saldo do cartão
 * exatamente como um pagamento reduziria (mesmas fórmulas de `getCardBalanceThroughMonth`/
 * `getCardTotalCommitted`), sem precisar de uma conta pagadora real — o crédito veio do
 * lojista/emissor, nunca de uma conta rastreada do usuário. O valor é sempre `card_purchases.amount`
 * (o total da compra), nunca aceito do client, e a constraint `card_refunds_card_purchase_id_key`
 * impede estornar a mesma compra duas vezes.
 */
export async function refundCardPurchase(purchaseId: string, refundDate: string): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();

  const { data: purchase, error: purchaseError } = await supabase
    .from("card_purchases")
    .select("id, credit_card_id, amount")
    .eq("id", purchaseId)
    .single();
  if (purchaseError) throw new Error(purchaseError.message);

  const { data: existingRefund } = await supabase.from("card_refunds").select("id").eq("card_purchase_id", purchaseId).maybeSingle();
  if (existingRefund) throw new Error("Esta compra já foi estornada.");

  const { expenseCategoryId, incomeCategoryId } = await getEstornoCategoryIds(supabase);

  const cycle = await getCardCycle(supabase, purchase.credit_card_id);
  const openInvoiceCompetence = calculateInstallmentCompetences(refundDate, cycle.closing_day, cycle.due_day, 1)[0];

  const { error: advanceError } = await supabase
    .from("card_installments")
    .update({ competence: openInvoiceCompetence })
    .eq("purchase_id", purchaseId)
    .gt("competence", openInvoiceCompetence);
  if (advanceError) throw new Error(advanceError.message);

  const { error: updateError } = await supabase
    .from("card_purchases")
    .update({ category_id: expenseCategoryId, subcategory_id: null })
    .eq("id", purchaseId);
  if (updateError) throw new Error(updateError.message);

  const { error: refundError } = await supabase.from("card_refunds").insert({
    user_id: user.id,
    card_purchase_id: purchaseId,
    credit_card_id: purchase.credit_card_id,
    category_id: incomeCategoryId,
    amount: purchase.amount,
    refund_date: refundDate,
  });
  if (refundError) throw new Error(refundError.message);
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
  const refundDateByPurchase = new Map<string, string>();
  const remainingByPurchase = new Map<string, number>();
  const remainingCountByPurchase = new Map<string, number>();
  if (purchaseIds.length) {
    const cycle = await getCardCycle(supabase, cardId);
    const openMonth = calculateInstallmentCompetences(todayIso(), cycle.closing_day, cycle.due_day, 1)[0];

    const [{ data: installments, error: installmentError }, { data: refunds, error: refundError }] = await Promise.all([
      supabase
        .from("card_installments")
        .select("purchase_id, competence, amount, paid_before_system")
        .in("purchase_id", purchaseIds)
        .order("competence", { ascending: true }),
      supabase.from("card_refunds").select("card_purchase_id, refund_date").in("card_purchase_id", purchaseIds),
    ]);
    if (installmentError) throw new Error(installmentError.message);
    if (refundError) throw new Error(refundError.message);
    for (const row of installments ?? []) {
      if (!firstCompetenceByPurchase.has(row.purchase_id)) {
        firstCompetenceByPurchase.set(row.purchase_id, monthKey(row.competence));
      }
      if (!row.paid_before_system && row.competence > openMonth) {
        remainingByPurchase.set(row.purchase_id, addMoney(remainingByPurchase.get(row.purchase_id) ?? 0, row.amount));
        remainingCountByPurchase.set(row.purchase_id, (remainingCountByPurchase.get(row.purchase_id) ?? 0) + 1);
      }
    }
    for (const row of refunds ?? []) {
      refundDateByPurchase.set(row.card_purchase_id, row.refund_date);
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
    paidThroughCompetence: row.paid_through_competence ? monthKey(row.paid_through_competence) : undefined,
    refundedAt: refundDateByPurchase.get(row.id),
    remainingUnbilledAmount: remainingByPurchase.get(row.id) ?? 0,
    remainingInstallmentsCount: remainingCountByPurchase.get(row.id) ?? 0,
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
    .select("*, card_purchases(description, installments, purchase_date)")
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

  // Compras à vista (1/1) primeiro, depois parceladas; dentro de cada grupo, ordena pela data real da compra.
  const rows = (data ?? []).map((row) => ({
    id: row.id,
    purchaseId: row.purchase_id,
    installmentNumber: numbered.get(row.id) ?? 1,
    totalInstallments: row.card_purchases?.installments ?? 1,
    amount: row.amount,
    competenceMonth: monthKey(row.competence),
    description: row.card_purchases?.description ?? "",
    purchaseDate: row.card_purchases?.purchase_date ?? "",
    paidBeforeSystem: row.paid_before_system,
  }));

  rows.sort((a, b) => {
    const aSingle = a.totalInstallments === 1;
    const bSingle = b.totalInstallments === 1;
    if (aSingle !== bSingle) return aSingle ? -1 : 1;
    return a.purchaseDate < b.purchaseDate ? -1 : a.purchaseDate > b.purchaseDate ? 1 : 0;
  });

  return rows;
}

/** Sum of installments due through (and including) `throughMonth`, minus payments already made — what a "pay the bill" action should actually suggest, not the full lifetime balance including installments still in the future. Excludes `paid_before_system` installments — a backfilled/retroactive purchase already settled outside the system, see AI_CONTEXT.md "Compras retroativas". Also subtracts `card_refunds` up to `throughMonth` — a refund reduces what's owed exactly like a payment does (AI_CONTEXT.md "Estorno"). */
export async function getCardBalanceThroughMonth(creditCardId: string, throughMonth: string): Promise<number> {
  const supabase = await createClient();
  const periodEnd = endOfMonth(`${throughMonth}-01`);

  const [{ data: installments }, { data: payments }, { data: refunds }] = await Promise.all([
    supabase
      .from("card_installments")
      .select("amount")
      .eq("credit_card_id", creditCardId)
      .eq("paid_before_system", false)
      .lte("competence", periodEnd),
    supabase.from("card_payments").select("amount").eq("credit_card_id", creditCardId),
    supabase.from("card_refunds").select("amount").eq("credit_card_id", creditCardId).lte("refund_date", periodEnd),
  ]);
  const totalInstallments = sumMoney((installments ?? []).map((i) => i.amount));
  const totalPayments = sumMoney([...(payments ?? []).map((p) => p.amount), ...(refunds ?? []).map((r) => r.amount)]);
  return Math.max(0, subtractMoney(totalInstallments, totalPayments));
}

/** Every installment ever generated for the card (past, current, and future not-yet-due) minus every
 * payment ever made — the true "against the limit" figure. Deliberately different from
 * `getCardBalanceThroughMonth`, which excludes future installments not yet due (see AI_CONTEXT.md
 * "CREDIT_CARD_PAYMENT" — that one drives the "Pagar fatura" suggestion, not the limit-usage display).
 * Also excludes `paid_before_system` installments, same reasoning as `getCardBalanceThroughMonth`,
 * and subtracts every `card_refunds` row ever made (a full refund frees up the limit again).
 */
export async function getCardTotalCommitted(creditCardId: string): Promise<number> {
  const supabase = await createClient();
  const [{ data: installments }, { data: payments }, { data: refunds }] = await Promise.all([
    supabase.from("card_installments").select("amount").eq("credit_card_id", creditCardId).eq("paid_before_system", false),
    supabase.from("card_payments").select("amount").eq("credit_card_id", creditCardId),
    supabase.from("card_refunds").select("amount").eq("credit_card_id", creditCardId),
  ]);
  const totalInstallments = sumMoney((installments ?? []).map((i) => i.amount));
  const totalPayments = sumMoney([...(payments ?? []).map((p) => p.amount), ...(refunds ?? []).map((r) => r.amount)]);
  return Math.max(0, subtractMoney(totalInstallments, totalPayments));
}

/**
 * Cards page summary. Two independent month concepts, deliberately not the same parameter:
 * - `usedThroughCurrentMonth`/`overdueAmount` are always anchored to TODAY's real month — "how
 *   much do I actually owe right now," which is what "Pagar fatura" suggests as the payment
 *   amount. This must stay real-time even while the page is browsing a past/future month via
 *   the month filter — paging through history shouldn't change what a real payment today should be.
 * - `currentMonthInvoice` reflects `viewedMonth` (the page's month filter) — "what does this
 *   invoice look like for the month being viewed," which changes as the user pages through it.
 * - `totalCommitted` (see `getCardTotalCommitted`) is the full outstanding balance including
 *   future not-yet-due installments — the correct figure for "used against the limit," since
 *   `usedThroughCurrentMonth` alone would undercount scheduled-but-not-yet-billed installments.
 *
 * `currentMonthInvoice`/`todayInvoice` (below) deliberately do NOT exclude `paid_before_system`
 * installments — they represent the historical fact "what was billed that month," which doesn't
 * change just because the user later logged that bill as already paid outside the system. Only
 * `usedThroughCurrentMonth`/`totalCommitted` (via the two functions above) answer "what's still
 * owed," so only those exclude them.
 *
 * `currentMonthPaidAmount`: `card_payments` has no competence/invoice-month of its own — a payment
 * is just a lump sum against the card, never allocated to a specific month. So "how much of THIS
 * invoice is paid" is derived, not stored, using the same oldest-competence-first assumption the
 * balance functions above already imply (a payment always reduces the oldest unpaid installments
 * first): `paid_before_system` installments in the viewed month count as paid outright (already
 * settled outside the system); the rest is however much of all-time `card_payments` is left over
 * after covering every non-`paid_before_system` installment strictly before the viewed month. This
 * is a heuristic, not a real allocation record — a payment actually meant to cover a future month
 * in advance would still show as paying down the oldest month first.
 *
 * `openInvoiceMonth`/`openInvoiceAmount`: which invoice is still open (accumulating new charges)
 * right now — the competence a purchase made TODAY would land in, via the same
 * `calculateInstallmentCompetences` math a real purchase uses. Always today-anchored like
 * `usedThroughCurrentMonth`, never the page's viewed-month filter. Lets the UI show "fatura do mês
 * atual" and "fatura aberta no momento" as two distinct lines only when the closing day has
 * already pushed new charges into a different month than the one currently displayed.
 */
export async function getCardSummary(creditCardId: string, viewedMonth: string, creditLimit: number | null): Promise<CardSummaryDTO> {
  const supabase = await createClient();
  const todayMonth = monthKey(todayIso());
  const viewedStart = startOfMonth(`${viewedMonth}-01`);
  const viewedEnd = endOfMonth(`${viewedMonth}-01`);
  const todayStart = startOfMonth(`${todayMonth}-01`);
  const todayEnd = endOfMonth(`${todayMonth}-01`);
  const viewingCurrentMonth = viewedMonth === todayMonth;

  const cycle = await getCardCycle(supabase, creditCardId);
  const openInvoiceMonth = monthKey(calculateInstallmentCompetences(todayIso(), cycle.closing_day, cycle.due_day, 1)[0]);
  const openStart = startOfMonth(`${openInvoiceMonth}-01`);
  const openEnd = endOfMonth(`${openInvoiceMonth}-01`);
  const viewingOpenMonth = viewedMonth === openInvoiceMonth;

  const [
    usedThroughCurrentMonth,
    totalCommitted,
    { data: viewedInstallments, error: viewedError },
    todayInstallmentsResult,
    { data: billedBeforeViewedRows, error: billedBeforeError },
    { data: paymentRows, error: paymentsError },
    openInstallmentsResult,
    { data: refundRows, error: refundsError },
    { data: allInstallmentRows, error: allInstallmentsError },
  ] = await Promise.all([
    getCardBalanceThroughMonth(creditCardId, todayMonth),
    getCardTotalCommitted(creditCardId),
    supabase.from("card_installments").select("amount, paid_before_system").eq("credit_card_id", creditCardId).gte("competence", viewedStart).lte("competence", viewedEnd),
    viewingCurrentMonth
      ? Promise.resolve(null)
      : supabase.from("card_installments").select("amount").eq("credit_card_id", creditCardId).gte("competence", todayStart).lte("competence", todayEnd),
    supabase.from("card_installments").select("amount").eq("credit_card_id", creditCardId).eq("paid_before_system", false).lt("competence", viewedStart),
    supabase.from("card_payments").select("amount").eq("credit_card_id", creditCardId),
    viewingOpenMonth
      ? Promise.resolve(null)
      : supabase.from("card_installments").select("amount").eq("credit_card_id", creditCardId).gte("competence", openStart).lte("competence", openEnd),
    supabase.from("card_refunds").select("amount, refund_date").eq("credit_card_id", creditCardId),
    supabase.from("card_installments").select("amount").eq("credit_card_id", creditCardId).eq("paid_before_system", false),
  ]);
  if (viewedError) throw new Error(viewedError.message);
  if (todayInstallmentsResult?.error) throw new Error(todayInstallmentsResult.error.message);
  if (billedBeforeError) throw new Error(billedBeforeError.message);
  if (paymentsError) throw new Error(paymentsError.message);
  if (openInstallmentsResult?.error) throw new Error(openInstallmentsResult.error.message);
  if (refundsError) throw new Error(refundsError.message);
  if (allInstallmentsError) throw new Error(allInstallmentsError.message);

  const currentMonthInvoice = sumMoney((viewedInstallments ?? []).map((i) => i.amount));
  const todayInvoice = viewingCurrentMonth ? currentMonthInvoice : sumMoney((todayInstallmentsResult?.data ?? []).map((i) => i.amount));
  const overdueAmount = Math.max(0, subtractMoney(usedThroughCurrentMonth, todayInvoice));
  const openInvoiceAmount = viewingOpenMonth ? currentMonthInvoice : sumMoney((openInstallmentsResult?.data ?? []).map((i) => i.amount));

  const monthPaidBeforeSystemAmount = sumMoney((viewedInstallments ?? []).filter((i) => i.paid_before_system).map((i) => i.amount));
  const billedNotBeforeSystemBeforeViewedMonth = sumMoney((billedBeforeViewedRows ?? []).map((i) => i.amount));
  const billedNotBeforeSystemThroughViewedMonth = addMoney(
    sumMoney((viewedInstallments ?? []).filter((i) => !i.paid_before_system).map((i) => i.amount)),
    billedNotBeforeSystemBeforeViewedMonth
  );
  const totalPayments = sumMoney((paymentRows ?? []).map((p) => p.amount));
  // A `card_refunds` credit behaves like a payment for allocation: it pays down the oldest unpaid
  // competence first (AI_CONTEXT.md "Estorno") and any surplus carries forward to later invoices.
  // Only refunds credited on or before the viewed month's end count — a refund logged later never
  // retroactively settles an earlier month, same convention as getCardBalanceThroughMonth.
  const refundsThroughViewedMonth = sumMoney(
    (refundRows ?? []).filter((r) => r.refund_date <= viewedEnd).map((r) => r.amount)
  );
  const allRefunds = sumMoney((refundRows ?? []).map((r) => r.amount));
  const creditPoolThroughViewedMonth = addMoney(totalPayments, refundsThroughViewedMonth);
  const monthPaidViaPayments = subtractMoney(
    Math.min(billedNotBeforeSystemThroughViewedMonth, creditPoolThroughViewedMonth),
    Math.min(billedNotBeforeSystemBeforeViewedMonth, creditPoolThroughViewedMonth)
  );
  const currentMonthPaidAmount = sumMoney([monthPaidBeforeSystemAmount, monthPaidViaPayments]);

  // Surplus credit — payments + refunds beyond everything ever billed (excl. paid_before_system).
  // Shown as "saldo a favor"; consumed automatically by future invoices via the allocation above.
  // Never withdrawable, never touches account balances — it's card-only credit.
  const allInstallmentsNotBeforeSystem = sumMoney((allInstallmentRows ?? []).map((i) => i.amount));
  const creditBalance = Math.max(
    0,
    subtractMoney(addMoney(totalPayments, allRefunds), allInstallmentsNotBeforeSystem)
  );

  return {
    accountId: creditCardId,
    creditLimit,
    usedThroughCurrentMonth,
    currentMonthInvoice,
    currentMonthPaidAmount,
    overdueAmount,
    totalCommitted,
    creditBalance,
    openInvoiceMonth,
    openInvoiceAmount,
  };
}

/**
 * The `is_system` EXPENSE category every CREDIT_CARD_PAYMENT transaction is tagged with
 * (migration 0031). The user can never pick it from a form (is_system => filtered out of
 * CategorySelect) — only this flow applies it. It's EXPENSE-typed even though a card payment
 * isn't an EXPENSE transaction (there's no CategoryType for CREDIT_CARD_PAYMENT); it never
 * reaches analytics, which restrict `type in ('INCOME','EXPENSE')` at the query level. See
 * AI_CONTEXT.md "Pagamento de Cartão — categoria is_system".
 */
async function getCardPaymentCategoryId(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string> {
  const { data, error } = await supabase
    .from("categories")
    .select("id")
    .eq("is_system", true)
    .eq("name", "Pagamento de Cartão")
    .eq("type", "EXPENSE")
    .single();
  if (error) throw new Error('Categoria de sistema "Pagamento de Cartão" (EXPENSE) não encontrada — verifique o seed');
  return data.id;
}

/**
 * Shared by `registerCardPayment` ("Pagar fatura") and `advancePurchaseInstallments`
 * ("Antecipar parcelas") — both are, mechanically, the exact same thing: a CREDIT_CARD_PAYMENT
 * transaction plus its linked card_payments row, reducing the card's outstanding balance via the
 * same `getCardBalanceThroughMonth`/`getCardTotalCommitted` formulas. Only the description and
 * which amount gets suggested differ.
 */
async function insertCardPayment(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  input: { creditCardId: string; accountId: string; amount: number; paymentDate: string; description: string }
): Promise<void> {
  const categoryId = await getCardPaymentCategoryId(supabase);
  const { data: transaction, error: txError } = await supabase
    .from("transactions")
    .insert({
      user_id: userId,
      type: "CREDIT_CARD_PAYMENT",
      origin_account_id: input.accountId,
      destination_account_id: input.creditCardId,
      amount: input.amount,
      date: input.paymentDate,
      description: input.description,
      category_id: categoryId,
    })
    .select("id")
    .single();
  if (txError) throw new Error(txError.message);

  const { error: paymentError } = await supabase.from("card_payments").insert({
    user_id: userId,
    credit_card_id: input.creditCardId,
    account_id: input.accountId,
    transaction_id: transaction.id,
    amount: input.amount,
    payment_date: input.paymentDate,
  });
  if (paymentError) throw new Error(paymentError.message);
}

/**
 * Pays the card bill: creates both a CREDIT_CARD_PAYMENT transaction and the linked card_payments
 * metadata row. `transactions.description` defaults to naming the card ("Pagamento da fatura do
 * cartão {name}") since the payment form itself has no description field (see AI_CONTEXT.md
 * "CREDIT_CARD_PAYMENT") — without this the row showed up blank ("Sem descrição") everywhere the
 * description column is displayed or searched (Transaction Explorer, Lançamentos).
 */
export async function registerCardPayment(input: CardPaymentInput): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const { data: card } = await supabase.from("accounts").select("name").eq("id", input.creditCardId).single();
  await insertCardPayment(supabase, user.id, {
    creditCardId: input.creditCardId,
    accountId: input.accountId,
    amount: input.amount,
    paymentDate: input.paymentDate,
    description: `Pagamento da fatura do cartão ${card?.name ?? ""}`.trim(),
  });
}

/**
 * Parcelas de uma compra ainda não faturadas (competence depois da fatura aberta agora),
 * ordenadas por competence — a lista sobre a qual "Antecipar parcelas" abaixo opera. Não inclui
 * parcelas paid_before_system (já quitadas fora do sistema, ver "Compras retroativas") nem as já
 * faturadas (essas já entram na fatura normal via getCardBalanceThroughMonth).
 */
export async function getPurchaseFutureInstallments(purchaseId: string): Promise<{ id: string; competence: string; amount: number }[]> {
  const supabase = await createClient();
  const { data: purchase, error: purchaseError } = await supabase.from("card_purchases").select("credit_card_id").eq("id", purchaseId).single();
  if (purchaseError) throw new Error(purchaseError.message);
  const cycle = await getCardCycle(supabase, purchase.credit_card_id);
  const openCompetence = calculateInstallmentCompetences(todayIso(), cycle.closing_day, cycle.due_day, 1)[0];
  const { data: installments, error: installmentsError } = await supabase
    .from("card_installments")
    .select("id, competence, amount")
    .eq("purchase_id", purchaseId)
    .eq("paid_before_system", false)
    .gt("competence", openCompetence)
    .order("competence", { ascending: true });
  if (installmentsError) throw new Error(installmentsError.message);
  return installments ?? [];
}

/**
 * "Antecipar parcelas" (corrigido 2026-08-23, a pedido do usuário — a primeira versão pagava a
 * fatura, o que estava conceitualmente errado: antecipar não move dinheiro nenhum, só remaneja
 * competência, igual `refundCardPurchase` faz, só que parcial e escolhido pelo usuário). Das
 * parcelas ainda não faturadas de uma compra, o usuário escolhe **quantas** (`count`) — não
 * precisa ser todas. As `count` mais próximas (as primeiras da lista ordenada por competence) vão
 * todas pra mesma competência da fatura aberta agora; as demais são renumeradas em sequência logo
 * em seguida, sem pular mês nenhum — encurtando o parcelamento em `count` meses. Isso só muda
 * QUANDO a despesa está prevista pra faturar, nunca cria pagamento nenhum — pra de fato pagar as
 * parcelas antecipadas (agora todas na fatura corrente) o usuário ainda usa o fluxo normal de
 * "Pagar fatura" depois.
 */
export async function advancePurchaseInstallments(purchaseId: string, count: number): Promise<void> {
  const supabase = await createClient();

  const { data: purchase, error: purchaseError } = await supabase.from("card_purchases").select("credit_card_id").eq("id", purchaseId).single();
  if (purchaseError) throw new Error(purchaseError.message);
  const cycle = await getCardCycle(supabase, purchase.credit_card_id);
  const openCompetence = calculateInstallmentCompetences(todayIso(), cycle.closing_day, cycle.due_day, 1)[0];

  const future = await getPurchaseFutureInstallments(purchaseId);
  if (count < 1 || count > future.length) throw new Error("Quantidade de parcelas inválida.");

  const toAdvance = future.slice(0, count);
  const toReschedule = future.slice(count);

  for (const installment of toAdvance) {
    const { error } = await supabase.from("card_installments").update({ competence: openCompetence }).eq("id", installment.id);
    if (error) throw new Error(error.message);
  }
  for (let i = 0; i < toReschedule.length; i++) {
    const newCompetence = addMonthsToIsoDate(openCompetence, i + 1);
    const { error } = await supabase.from("card_installments").update({ competence: newCompetence }).eq("id", toReschedule[i].id);
    if (error) throw new Error(error.message);
  }
}

/**
 * Default month the Cards page lands on when the user hasn't picked one via MonthNav (no `?month=`
 * in the URL). Practicality tweak (2026-08-28, at the user's request): if there's nothing left to
 * pay on any card right now, jump straight to next month so the user doesn't have to click forward
 * every time everything's settled — but only when next month actually has installments to look at;
 * with nothing billed next month, stay on the current month.
 *
 * "Nothing left to pay" is `getCardBalanceThroughMonth(card, todayMonth) === 0` for every card —
 * the same "how much do I owe right now" figure "Pagar fatura" suggests. It already nets out
 * payments AND refunds and rolls in any overdue balance from earlier months, so a fully-refunded
 * or fully-paid invoice counts as settled while a partial payment or an old unpaid invoice keeps
 * the page on the current month.
 */
export async function getDefaultCardsMonth(): Promise<string> {
  const supabase = await createClient();
  const todayMonth = monthKey(todayIso());
  const nextMonth = monthKey(addMonthsToIsoDate(`${todayMonth}-01`, 1));

  const { data: cardRows, error } = await supabase.from("credit_cards").select("account_id");
  if (error) throw new Error(error.message);
  const cardIds = (cardRows ?? []).map((c) => c.account_id);
  if (cardIds.length === 0) return todayMonth;

  const nextStart = startOfMonth(`${nextMonth}-01`);
  const nextEnd = endOfMonth(`${nextMonth}-01`);

  const [balances, { data: nextInstallments, error: nextError }] = await Promise.all([
    Promise.all(cardIds.map((id) => getCardBalanceThroughMonth(id, todayMonth))),
    supabase
      .from("card_installments")
      .select("amount")
      .in("credit_card_id", cardIds)
      .gte("competence", nextStart)
      .lte("competence", nextEnd),
  ]);
  if (nextError) throw new Error(nextError.message);

  const allSettled = balances.every((b) => b === 0);
  const nextMonthTotal = sumMoney((nextInstallments ?? []).map((i) => i.amount));

  return allSettled && nextMonthTotal > 0 ? nextMonth : todayMonth;
}

/**
 * Card spend evolution: 6 months before through 6 months after `referenceMonth` (the Cards page's
 * viewed month), by installment competence (never purchase_date — same rule as every other credit
 * card analytic). `cardIds` scopes which cards are summed together (the Cards page passes either
 * every card the user has, or just the one selected via its existing "Cartão" filter);
 * `categoryIds`, when given, narrows to purchases in those categories via a join against
 * card_purchases (category lives there, not on the installment row itself) — and also drives the
 * per-category `byCategory` breakdown, which the chart stacks when a category filter is active.
 * `total` is the historical billed total per month — deliberately does NOT exclude
 * paid_before_system installments, mirroring CardSummaryDTO.currentMonthInvoice's reasoning: a
 * later retroactive log doesn't change what was actually billed that month.
 *
 * `paid`/`unpaid` split that same `total` into "already covered" vs "still owed", using the exact
 * oldest-competence-first payment allocation as CardSummaryDTO.currentMonthPaidAmount, run
 * per-card (card_payments are per-card, never per-category) then summed. Only computed when no
 * category filter is active — a payment can't be attributed to a category — so with `categoryIds`
 * passed both come back 0 and the chart stacks `byCategory` instead of the green/red split.
 */
export async function getCardMonthlyEvolution(
  cardIds: string[],
  referenceMonth: string,
  categoryIds?: string[]
): Promise<CardMonthlyEvolutionDTO[]> {
  const referenceStart = startOfMonth(`${referenceMonth}-01`);
  const periodStart = startOfMonth(addMonthsToIsoDate(referenceStart, -6));
  const periodEnd = endOfMonth(addMonthsToIsoDate(referenceStart, 6));

  const months: string[] = [];
  let cursor = monthKey(periodStart);
  const endMonth = monthKey(periodEnd);
  while (cursor <= endMonth) {
    months.push(cursor);
    cursor = monthKey(addMonthsToIsoDate(`${cursor}-01`, 1));
  }
  const emptyResult = () => months.map((month) => ({ month: formatMonthLabel(month, true), total: 0, paid: 0, unpaid: 0, byCategory: [] }));

  if (cardIds.length === 0) return emptyResult();

  const supabase = await createClient();

  let purchaseQuery = supabase
    .from("card_purchases")
    .select("id, category_id, categories(name, color)")
    .in("credit_card_id", cardIds);
  if (categoryIds?.length) purchaseQuery = purchaseQuery.in("category_id", categoryIds);
  const { data: purchasesData, error: purchaseError } = await purchaseQuery;
  if (purchaseError) throw new Error(purchaseError.message);
  const purchases = (purchasesData ?? []) as unknown as Array<{
    id: string;
    category_id: string | null;
    categories: { name: string; color: string } | null;
  }>;
  if (purchases.length === 0) return emptyResult();

  const purchaseById = new Map(purchases.map((p) => [p.id, p]));
  const purchaseIds = [...purchaseById.keys()];

  const { data: installmentsData, error: installmentError } = await supabase
    .from("card_installments")
    .select("amount, competence, purchase_id")
    .in("purchase_id", purchaseIds)
    .gte("competence", periodStart)
    .lte("competence", periodEnd);
  if (installmentError) throw new Error(installmentError.message);
  const installments = installmentsData ?? [];

  // paid/unpaid split — only when no category filter (payments aren't per-category). Runs the
  // same oldest-competence-first allocation as getCardSummary.currentMonthPaidAmount, per card.
  const paidByMonth = new Map<string, number>();
  const unpaidByMonth = new Map<string, number>();
  if (!categoryIds?.length) {
    const [{ data: allInst, error: allInstError }, { data: allPay, error: allPayError }, { data: allRefunds, error: allRefundsError }] = await Promise.all([
      supabase
        .from("card_installments")
        .select("amount, competence, paid_before_system, credit_card_id")
        .in("credit_card_id", cardIds)
        .lte("competence", periodEnd),
      supabase.from("card_payments").select("amount, credit_card_id").in("credit_card_id", cardIds),
      supabase.from("card_refunds").select("amount, credit_card_id, refund_date").in("credit_card_id", cardIds).lte("refund_date", periodEnd),
    ]);
    if (allInstError) throw new Error(allInstError.message);
    if (allPayError) throw new Error(allPayError.message);
    if (allRefundsError) throw new Error(allRefundsError.message);

    for (const cardId of cardIds) {
      const cardInst = (allInst ?? []).filter((i) => i.credit_card_id === cardId);
      // A refund credits the card like a payment (AI_CONTEXT.md "Estorno") — folded into the same
      // oldest-first pool so an estornado invoice shows as covered (green), not still owed.
      const totalPayments = sumMoney([
        ...(allPay ?? []).filter((p) => p.credit_card_id === cardId).map((p) => p.amount),
        ...(allRefunds ?? []).filter((r) => r.credit_card_id === cardId).map((r) => r.amount),
      ]);
      for (const month of months) {
        const monthStart = startOfMonth(`${month}-01`);
        const inMonth = cardInst.filter((i) => monthKey(i.competence) === month);
        const totalInMonth = sumMoney(inMonth.map((i) => i.amount));
        if (totalInMonth === 0) continue;
        const pbsInMonth = sumMoney(inMonth.filter((i) => i.paid_before_system).map((i) => i.amount));
        const notBeforeThrough = sumMoney(
          cardInst.filter((i) => !i.paid_before_system && monthKey(i.competence) <= month).map((i) => i.amount)
        );
        const notBeforeBefore = sumMoney(
          cardInst.filter((i) => !i.paid_before_system && i.competence < monthStart).map((i) => i.amount)
        );
        const paidViaPayments = subtractMoney(
          Math.min(notBeforeThrough, totalPayments),
          Math.min(notBeforeBefore, totalPayments)
        );
        const paidInMonth = Math.min(totalInMonth, addMoney(pbsInMonth, paidViaPayments));
        paidByMonth.set(month, addMoney(paidByMonth.get(month) ?? 0, paidInMonth));
        unpaidByMonth.set(month, addMoney(unpaidByMonth.get(month) ?? 0, subtractMoney(totalInMonth, paidInMonth)));
      }
    }
  }

  return months.map((month) => {
    const rows = installments.filter((row) => monthKey(row.competence) === month);

    const byCategoryMap = new Map<string, { categoryId: string; categoryName: string; color: string; amounts: number[] }>();
    for (const row of rows) {
      const purchase = purchaseById.get(row.purchase_id);
      const key = purchase?.category_id ?? "uncategorized";
      const bucket = byCategoryMap.get(key) ?? {
        categoryId: key,
        categoryName: purchase?.categories?.name ?? "Sem categoria",
        color: purchase?.categories?.color ?? "#98989b",
        amounts: [],
      };
      bucket.amounts.push(row.amount);
      byCategoryMap.set(key, bucket);
    }

    return {
      month: formatMonthLabel(month, true),
      total: sumMoney(rows.map((row) => row.amount)),
      paid: paidByMonth.get(month) ?? 0,
      unpaid: unpaidByMonth.get(month) ?? 0,
      byCategory: [...byCategoryMap.values()].map((b) => ({
        categoryId: b.categoryId,
        categoryName: b.categoryName,
        color: b.color,
        amount: sumMoney(b.amounts),
      })),
    };
  });
}
