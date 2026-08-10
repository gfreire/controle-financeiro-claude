import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/getUser";
import { startOfMonth, endOfMonth } from "@/lib/utils/date";
import { sumMoney } from "@/lib/utils/money";
import { reconcileFixedExpenseFloors } from "./_shared";
import { createTransaction } from "./transactions.service";
import { createCardPurchase } from "./cards.service";
import type { FixedExpenseInput } from "@/lib/validations/fixed-expenses";
import type { FixedExpenseDTO } from "@/types/dto";

/**
 * Before the real payment lands this month, `projectedAmount` shows the planned amount as a
 * placeholder; once a real transaction (or, for a card-paid fixed expense, a linked
 * card_purchase's installment) is registered, it switches to the real value — this is what
 * avoids ever double-counting the placeholder and the real payment.
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

  const results = await Promise.all(
    (fixedExpenses ?? []).map(async (row) => {
      const [{ data: linked, error: linkedError }, { data: cardPurchases, error: purchaseError }] = await Promise.all([
        supabase.from("transactions").select("amount, date").eq("fixed_expense_id", row.id).gte("date", monthStart).lte("date", monthEnd),
        supabase.from("card_purchases").select("id, purchase_date").eq("fixed_expense_id", row.id),
      ]);
      if (linkedError) throw new Error(linkedError.message);
      if (purchaseError) throw new Error(purchaseError.message);

      // Card-paid fixed expenses are tracked by installment competence, never purchase_date —
      // same rule as every other credit card analytic (AI_CONTEXT.md "Credit Card Purchases").
      const purchaseIds = (cardPurchases ?? []).map((p) => p.id);
      let cardAmount = 0;
      let matchedPurchaseIds: string[] = [];
      if (purchaseIds.length) {
        const { data: installments, error: installmentError } = await supabase
          .from("card_installments")
          .select("amount, purchase_id")
          .in("purchase_id", purchaseIds)
          .gte("competence", monthStart)
          .lte("competence", monthEnd);
        if (installmentError) throw new Error(installmentError.message);
        cardAmount = sumMoney((installments ?? []).map((i) => i.amount));
        matchedPurchaseIds = [...new Set((installments ?? []).map((i) => i.purchase_id))];
      }

      const actualAmount = sumMoney([sumMoney((linked ?? []).map((t) => t.amount)), cardAmount]);
      const isPaidThisMonth = actualAmount > 0;
      const projectedAmount = isPaidThisMonth ? actualAmount : row.amount;
      const paidDate = isPaidThisMonth
        ? [
            ...(linked ?? []).map((t) => t.date),
            ...(cardPurchases ?? []).filter((p) => matchedPurchaseIds.includes(p.id)).map((p) => p.purchase_date),
          ].sort().at(-1)
        : undefined;

      return {
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
        paidDate,
        status: actualAmount > row.amount ? "EXCEEDED" : "OK",
      } satisfies FixedExpenseDTO;
    })
  );
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

  const notices = await reconcileFixedExpenseFloors(supabase, user.id, input.categoryId, input.subcategoryId);
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
  const notices = await reconcileFixedExpenseFloors(supabase, user.id, categoryId, subcategoryId);
  return { notices };
}

/**
 * Registers the real payment for a fixed expense, linked via fixed_expense_id — switches its
 * projectedAmount from planned to actual (see getFixedExpenses above). Defaults the description
 * server-side when left blank, same pattern as registerCardPayment/addDebtTransaction.
 *
 * The account's own type — never the client's say-so — decides how the payment is recorded:
 * a CASH/BANK account gets a plain EXPENSE transaction, exactly as before. A CREDIT_CARD account
 * instead registers a single-installment (1x) card purchase dated `input.date`, so it flows
 * through the normal card_purchases -> card_installments pipeline (competence-driven, same as
 * any other card purchase) instead of a fake plain expense against an account type transactions
 * was never meant to touch directly. The competence month is never computed here — it's whatever
 * createCardPurchase already derives from the card's closing_day/due_day (see AI_CONTEXT.md
 * "Credit Card Purchases": a purchase made after the invoice already closed rolls to next month).
 */
export async function payFixedExpense(input: {
  fixedExpenseId: string;
  originAccountId: string;
  amount: number;
  date: string;
  description?: string;
  categoryId?: string | null;
  subcategoryId?: string | null;
}): Promise<void> {
  const supabase = await createClient();
  const [{ data: expense }, { data: account, error: accountError }] = await Promise.all([
    supabase.from("fixed_expenses").select("name").eq("id", input.fixedExpenseId).single(),
    supabase.from("accounts").select("type").eq("id", input.originAccountId).single(),
  ]);
  if (accountError) throw new Error(accountError.message);
  const description = input.description || `Pagamento — ${expense?.name ?? ""}`.trim();

  if (account.type === "CREDIT_CARD") {
    await createCardPurchase({
      creditCardId: input.originAccountId,
      amount: input.amount,
      purchaseDate: input.date,
      description,
      categoryId: input.categoryId ?? undefined,
      subcategoryId: input.subcategoryId ?? undefined,
      installments: 1,
      fixedExpenseId: input.fixedExpenseId,
    });
    return;
  }

  await createTransaction({
    type: "EXPENSE",
    originAccountId: input.originAccountId,
    amount: input.amount,
    date: input.date,
    description,
    categoryId: input.categoryId ?? undefined,
    subcategoryId: input.subcategoryId ?? undefined,
    fixedExpenseId: input.fixedExpenseId,
  });
}

/**
 * Rolls back this month's payment for a fixed expense — the counterpart to payFixedExpense,
 * for when a payment was registered by mistake (wrong test data, wrong account, etc.) and the
 * fixed expense needs to go back to "not paid" rather than staying wrongly marked as settled.
 * Deletes whatever real record(s) made getFixedExpenses() compute isPaidThisMonth = true for
 * that month: linked `transactions` rows (CASH/BANK payments) and linked `card_purchases` rows
 * whose installment competence falls in the month (CREDIT_CARD payments) — card_installments
 * cascade-delete with their purchase (schema.sql), so no separate cleanup is needed there.
 */
export async function cancelFixedExpensePayment(fixedExpenseId: string, month: string): Promise<void> {
  const supabase = await createClient();
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);

  const { data: linkedTx, error: txError } = await supabase
    .from("transactions")
    .select("id")
    .eq("fixed_expense_id", fixedExpenseId)
    .gte("date", monthStart)
    .lte("date", monthEnd);
  if (txError) throw new Error(txError.message);
  if (linkedTx?.length) {
    const { error } = await supabase.from("transactions").delete().in("id", linkedTx.map((t) => t.id));
    if (error) throw new Error(error.message);
  }

  const { data: cardPurchases, error: cpError } = await supabase
    .from("card_purchases")
    .select("id")
    .eq("fixed_expense_id", fixedExpenseId);
  if (cpError) throw new Error(cpError.message);
  const purchaseIds = (cardPurchases ?? []).map((p) => p.id);
  if (purchaseIds.length) {
    const { data: installments, error: instError } = await supabase
      .from("card_installments")
      .select("purchase_id")
      .in("purchase_id", purchaseIds)
      .gte("competence", monthStart)
      .lte("competence", monthEnd);
    if (instError) throw new Error(instError.message);
    const matchedPurchaseIds = [...new Set((installments ?? []).map((i) => i.purchase_id))];
    if (matchedPurchaseIds.length) {
      const { error } = await supabase.from("card_purchases").delete().in("id", matchedPurchaseIds);
      if (error) throw new Error(error.message);
    }
  }
}

export async function deactivateFixedExpense(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("fixed_expenses").update({ active: false }).eq("id", id);
  if (error) throw new Error(error.message);
}
