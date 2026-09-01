import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/getUser";
import { startOfMonth, endOfMonth, monthKey } from "@/lib/utils/date";
import { sumMoney } from "@/lib/utils/money";
import { createTransaction } from "./transactions.service";
import type { RecurringIncomeInput, RegisterReceiptInput } from "@/lib/validations/recurring-incomes";
import type { RecurringIncomeDTO } from "@/types/dto";

/**
 * Receitas Recorrentes (migration 0038) — the mirror of fixed-expenses.service for predictable
 * income. A template + a per-month "já recebi?" row on /budgets. Deliberately isolated: it never
 * feeds `dashboard.service`'s `fetchPeriodEntries`, never imposes a budget floor (`_shared.ts`),
 * never creates a synthetic entry anywhere. Only the real INCOME `transactions` row that
 * `registerReceipt` creates (linked via `recurring_income_id`) ever moves a number.
 * See AI_CONTEXT.md "Receitas Recorrentes".
 */

/**
 * True while migration 0038 has NOT been applied yet — Postgres `42P01` (undefined_table) or
 * PostgREST `PGRST205` ("Could not find the table 'public.recurring_incomes' in the schema
 * cache"). Lets `getRecurringIncomes` degrade to `[]` so the whole `/budgets` page doesn't go
 * down between shipping this code and running the migration. Remove this guard once 0038 is
 * applied everywhere (it's a bridge, not a permanent tolerance).
 */
function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  return /recurring_incomes.*(schema cache|does not exist)/i.test(error.message ?? "");
}

/**
 * Only returns a recurring income whose start_competence <= month <= (end_competence or ∞) —
 * same window rule as getFixedExpenses. `receivedThisMonth` is derived from a linked INCOME
 * transaction dated in the month (never a stored flag).
 */
export async function getRecurringIncomes(month: string): Promise<RecurringIncomeDTO[]> {
  const supabase = await createClient();
  const user = await getUser();
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);

  const { data: rows, error } = await supabase
    .from("recurring_incomes")
    .select("*, categories(name)")
    .eq("user_id", user.id)
    .eq("active", true)
    .lte("start_competence", monthStart)
    .or(`end_competence.is.null,end_competence.gte.${monthStart}`)
    .order("day_of_month");
  if (error) {
    if (isMissingTableError(error)) return []; // migration 0038 pending — see isMissingTableError
    throw new Error(error.message);
  }

  return Promise.all(
    (rows ?? []).map(async (row) => {
      const { data: linked, error: linkedError } = await supabase
        .from("transactions")
        .select("amount, date")
        .eq("recurring_income_id", row.id)
        .gte("date", monthStart)
        .lte("date", monthEnd);
      if (linkedError) throw new Error(linkedError.message);

      const receivedAmount = sumMoney((linked ?? []).map((t) => t.amount));
      const receivedThisMonth = receivedAmount > 0;

      return {
        id: row.id,
        name: row.name,
        plannedAmount: row.amount,
        dayOfMonth: row.day_of_month,
        defaultAccountId: row.default_account_id ?? undefined,
        categoryId: row.category_id ?? undefined,
        categoryName: row.categories?.name ?? undefined,
        startCompetence: monthKey(row.start_competence),
        endCompetence: row.end_competence ? monthKey(row.end_competence) : undefined,
        receivedThisMonth,
        receivedAmount,
        receivedDate: receivedThisMonth ? (linked ?? []).map((t) => t.date).sort().at(-1) : undefined,
      } satisfies RecurringIncomeDTO;
    })
  );
}

/** A recurring income's category must be INCOME-typed (mirrors categories.service#createSubcategory's
 * INCOME-parent guard) — checked here, not just by the form only offering INCOME categories. */
async function assertIncomeCategory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  categoryId: string | null | undefined
): Promise<void> {
  if (!categoryId) return;
  const { data, error } = await supabase.from("categories").select("type").eq("id", categoryId).single();
  if (error) throw new Error(error.message);
  if (data.type !== "INCOME") throw new Error("A categoria de uma receita recorrente precisa ser de receita.");
}

export async function createRecurringIncome(input: RecurringIncomeInput): Promise<string> {
  const supabase = await createClient();
  const user = await getUser();
  await assertIncomeCategory(supabase, input.categoryId);

  const { data, error } = await supabase
    .from("recurring_incomes")
    .insert({
      user_id: user.id,
      name: input.name,
      amount: input.amount,
      day_of_month: input.dayOfMonth,
      default_account_id: input.defaultAccountId ?? null,
      category_id: input.categoryId ?? null,
      start_competence: `${input.startCompetence}-01`,
      end_competence: input.endCompetence ? `${input.endCompetence}-01` : null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function updateRecurringIncome(id: string, input: Partial<RecurringIncomeInput>): Promise<void> {
  const supabase = await createClient();
  if (input.categoryId !== undefined) await assertIncomeCategory(supabase, input.categoryId);

  const { error } = await supabase
    .from("recurring_incomes")
    .update({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.dayOfMonth !== undefined ? { day_of_month: input.dayOfMonth } : {}),
      ...(input.defaultAccountId !== undefined ? { default_account_id: input.defaultAccountId } : {}),
      ...(input.categoryId !== undefined ? { category_id: input.categoryId } : {}),
      ...(input.startCompetence !== undefined ? { start_competence: `${input.startCompetence}-01` } : {}),
      ...(input.endCompetence !== undefined ? { end_competence: input.endCompetence ? `${input.endCompetence}-01` : null } : {}),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Soft delete (`active = false`) — matches reservoirs/budgets. No dangling-link problem to
 * justify a hard delete (the linked transactions are ON DELETE SET NULL and keep their own
 * category/value regardless). */
export async function deactivateRecurringIncome(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("recurring_incomes").update({ active: false }).eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Registers the real receipt as a plain INCOME transaction linked via `recurring_income_id`,
 * flipping `receivedThisMonth` for that month. The account's own type is read server-side and
 * must be CASH/BANK — predictable income lands in a real spendable account, never "onto a card".
 * Defaults the description when blank, same pattern as payFixedExpense / registerCardPayment.
 */
export async function registerReceipt(input: RegisterReceiptInput): Promise<void> {
  const supabase = await createClient();
  const [{ data: income }, { data: account, error: accountError }] = await Promise.all([
    supabase.from("recurring_incomes").select("name, category_id").eq("id", input.recurringIncomeId).single(),
    supabase.from("accounts").select("type").eq("id", input.accountId).single(),
  ]);
  if (accountError) throw new Error(accountError.message);
  if (account.type === "CREDIT_CARD") {
    throw new Error("Uma receita entra numa conta em dinheiro ou banco, nunca num cartão.");
  }

  await createTransaction({
    type: "INCOME",
    destinationAccountId: input.accountId,
    amount: input.amount,
    date: input.date,
    description: input.description?.trim() || `Recebimento — ${income?.name ?? ""}`.trim(),
    categoryId: input.categoryId ?? income?.category_id ?? undefined,
    recurringIncomeId: input.recurringIncomeId,
  });
}

/** Rolls back this month's receipt — deletes the linked INCOME transaction(s) dated in the
 * month. Mirror of cancelFixedExpensePayment. */
export async function cancelReceipt(recurringIncomeId: string, month: string): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);

  const { data: linked, error } = await supabase
    .from("transactions")
    .select("id")
    .eq("user_id", user.id)
    .eq("recurring_income_id", recurringIncomeId)
    .gte("date", monthStart)
    .lte("date", monthEnd);
  if (error) throw new Error(error.message);
  if (linked?.length) {
    const { error: delError } = await supabase.from("transactions").delete().in("id", linked.map((t) => t.id));
    if (delError) throw new Error(delError.message);
  }
}
