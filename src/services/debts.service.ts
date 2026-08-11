import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/getUser";
import { addMoney, sumMoney } from "@/lib/utils/money";
import type { DebtInput, DebtTransactionInput, UpdateDebtTransactionInput } from "@/lib/validations/debts";
import type { DebtDTO, DebtTransactionDTO } from "@/types/dto";

export async function getDebts(): Promise<DebtDTO[]> {
  const supabase = await createClient();
  const user = await getUser();

  const { data: debts, error } = await supabase
    .from("debts")
    .select("*")
    .eq("user_id", user.id)
    .eq("active", true)
    .order("agent");
  if (error) throw new Error(error.message);

  const results = await Promise.all(
    (debts ?? []).map(async (row) => {
      const { data: entries } = await supabase.from("debt_transactions").select("amount").eq("debt_id", row.id);
      return {
        id: row.id,
        side: row.side,
        agent: row.agent,
        originalAmount: row.initial_balance,
        remainingBalance: addMoney(row.initial_balance, sumMoney((entries ?? []).map((e) => e.amount))),
        active: row.active,
        defaultCategoryId: row.default_category_id ?? undefined,
      };
    })
  );
  return results;
}

export async function createDebt(input: DebtInput): Promise<string> {
  const supabase = await createClient();
  const user = await getUser();
  const { data, error } = await supabase
    .from("debts")
    .insert({
      user_id: user.id,
      agent: input.agent,
      side: input.side,
      initial_balance: input.initialBalance,
      default_category_id: input.defaultCategoryId ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

/** Agent/side/initialBalance/defaultCategoryId are all freely editable after creation — only the
 * computed remainingBalance formula (initial_balance + SUM(debt_transactions.amount)) is fixed. */
export async function updateDebt(id: string, input: Partial<DebtInput>): Promise<void> {
  const supabase = await createClient();
  const updates: Record<string, unknown> = {};
  if (input.agent !== undefined) updates.agent = input.agent;
  if (input.side !== undefined) updates.side = input.side;
  if (input.initialBalance !== undefined) updates.initial_balance = input.initialBalance;
  if (input.defaultCategoryId !== undefined) updates.default_category_id = input.defaultCategoryId;
  const { error } = await supabase.from("debts").update(updates).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getDebtTransactions(debtId: string): Promise<DebtTransactionDTO[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("debt_transactions")
    .select("*")
    .eq("debt_id", debtId)
    .order("date", { ascending: false });
  if (error) throw new Error(error.message);

  const linkedIds = (data ?? []).map((row) => row.linked_transaction_id).filter((id): id is string => !!id);
  const categoryByTransactionId = new Map<string, string | null>();
  if (linkedIds.length > 0) {
    const { data: linkedTransactions } = await supabase.from("transactions").select("id, category_id").in("id", linkedIds);
    for (const t of linkedTransactions ?? []) categoryByTransactionId.set(t.id, t.category_id);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    debtId: row.debt_id,
    date: row.date,
    description: row.description,
    amount: row.amount,
    linkedTransactionId: row.linked_transaction_id ?? undefined,
    categoryId: row.linked_transaction_id ? categoryByTransactionId.get(row.linked_transaction_id) ?? undefined : undefined,
  }));
}

/**
 * amount positive = debt increased; negative = a payment reduced it. linked_transaction_id is
 * only created when real money moved through a tracked account (createLinkedTransaction) — a
 * third party paying a bill directly leaves no `transactions` row, only this ledger entry.
 *
 * After the ledger entry lands, the debt's remaining balance is recomputed; if it reached zero
 * (or went negative — an intentional overpayment, e.g. interest the payer/creditor decided to
 * settle) the debt is soft-deleted (`active = false`) so it drops out of `getDebts()`. The UI
 * warns the user *before* submitting a payment that would do this (see `DebtTransactionDialog`),
 * but the actual deactivation is decided here, from the real post-insert balance, so it stays
 * correct even if the client's prediction and the database ever disagree.
 */
export async function addDebtTransaction(input: DebtTransactionInput): Promise<{ settled: boolean }> {
  const supabase = await createClient();
  const user = await getUser();

  const { data: debt, error: debtError } = await supabase
    .from("debts")
    .select("side, agent, initial_balance, default_category_id")
    .eq("id", input.debtId)
    .single();
  if (debtError) throw new Error(debtError.message);

  const description = input.description ?? `Movimentação da dívida ${debt.agent}`;
  let linkedTransactionId: string | null = null;

  if (input.createLinkedTransaction) {
    if (!input.linkedAccountId) throw new Error("linkedAccountId is required when creating a linked transaction");

    // A payment (negative amount) reducing a PAYABLE debt: money leaves the account (EXPENSE).
    // A payment reducing a RECEIVABLE debt: money enters the account (INCOME).
    // An increase (positive amount) on a RECEIVABLE (lending more): money leaves (EXPENSE).
    // An increase on a PAYABLE (borrowing more): money enters (INCOME).
    const isReduction = input.amount < 0;
    const type = (debt.side === "PAYABLE") === isReduction ? "EXPENSE" : "INCOME";
    // The debt's own default_category_id is only meaningful for a payment (same type as a
    // payment always is for this debt's side, see debt-form-dialog.tsx) — falling back to it
    // on an "increase" entry (opposite type) would silently attach a mismatched category.
    const categoryId = input.categoryId !== undefined ? input.categoryId : isReduction ? debt.default_category_id : null;

    const { data: transaction, error: txError } = await supabase
      .from("transactions")
      .insert({
        user_id: user.id,
        type,
        ...(type === "EXPENSE" ? { origin_account_id: input.linkedAccountId } : { destination_account_id: input.linkedAccountId }),
        amount: Math.abs(input.amount),
        date: input.date,
        description,
        category_id: categoryId,
      })
      .select("id")
      .single();
    if (txError) throw new Error(txError.message);
    linkedTransactionId = transaction.id;
  }

  const { error } = await supabase.from("debt_transactions").insert({
    debt_id: input.debtId,
    amount: input.amount,
    description,
    linked_transaction_id: linkedTransactionId,
    date: input.date,
  });
  if (error) throw new Error(error.message);

  const { data: entries } = await supabase.from("debt_transactions").select("amount").eq("debt_id", input.debtId);
  const remainingBalance = addMoney(debt.initial_balance, sumMoney((entries ?? []).map((e) => e.amount)));
  const settled = remainingBalance <= 0;
  if (settled) await deactivateDebt(input.debtId);

  return { settled };
}

/**
 * Editing a ledger entry propagates to its linked `transactions` row when one exists (amount,
 * date, description, category) — same "linked records stay consistent" rule already followed for
 * card purchases/installments (AI_CONTEXT.md "Linked Records Consistency"). The entry's direction
 * (increase vs payment) can never flip via edit — only DebtTransactionDialog's separate create
 * flows decide that, by amount sign at insert time — so a sign mismatch is rejected outright.
 * Recomputes and re-applies the same settle-to-zero auto-deactivation addDebtTransaction does,
 * since an edit can just as well bring the balance to zero as a new entry can.
 */
export async function updateDebtTransaction(input: UpdateDebtTransactionInput): Promise<{ settled: boolean }> {
  const supabase = await createClient();

  const { data: existing, error: fetchError } = await supabase
    .from("debt_transactions")
    .select("debt_id, linked_transaction_id, amount")
    .eq("id", input.id)
    .single();
  if (fetchError) throw new Error(fetchError.message);

  if (Math.sign(input.amount) !== Math.sign(existing.amount)) {
    throw new Error("Não é possível inverter o sentido do lançamento (aumento/pagamento) na edição.");
  }

  const { data: debt, error: debtError } = await supabase
    .from("debts")
    .select("agent, initial_balance")
    .eq("id", existing.debt_id)
    .single();
  if (debtError) throw new Error(debtError.message);

  const description = input.description ?? `Movimentação da dívida ${debt.agent}`;

  if (existing.linked_transaction_id) {
    const { error: txError } = await supabase
      .from("transactions")
      .update({
        amount: Math.abs(input.amount),
        date: input.date,
        description,
        category_id: input.categoryId ?? null,
      })
      .eq("id", existing.linked_transaction_id);
    if (txError) throw new Error(txError.message);
  }

  const { error } = await supabase
    .from("debt_transactions")
    .update({ amount: input.amount, date: input.date, description })
    .eq("id", input.id);
  if (error) throw new Error(error.message);

  const { data: entries } = await supabase.from("debt_transactions").select("amount").eq("debt_id", existing.debt_id);
  const remainingBalance = addMoney(debt.initial_balance, sumMoney((entries ?? []).map((e) => e.amount)));
  const settled = remainingBalance <= 0;
  if (settled) await deactivateDebt(existing.debt_id);

  return { settled };
}

/** Mirrors reservoirs.service.ts#deleteReservoirTransaction: a ledger entry's only reason to
 * exist, when linked, is to represent that specific movement — deleting it without its linked
 * `transactions` row would leave a dangling, purposeless transaction with no ledger trace. */
export async function deleteDebtTransaction(id: string): Promise<void> {
  const supabase = await createClient();
  const { data: existing, error: fetchError } = await supabase
    .from("debt_transactions")
    .select("linked_transaction_id")
    .eq("id", id)
    .single();
  if (fetchError) throw new Error(fetchError.message);

  const { error } = await supabase.from("debt_transactions").delete().eq("id", id);
  if (error) throw new Error(error.message);

  if (existing.linked_transaction_id) {
    await supabase.from("transactions").delete().eq("id", existing.linked_transaction_id);
  }
}

export async function deactivateDebt(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("debts").update({ active: false }).eq("id", id);
  if (error) throw new Error(error.message);
}
