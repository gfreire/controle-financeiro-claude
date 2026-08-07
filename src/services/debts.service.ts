import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/getUser";
import { addMoney, sumMoney } from "@/lib/utils/money";
import type { DebtInput, DebtTransactionInput } from "@/lib/validations/debts";
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

  const results: DebtDTO[] = [];
  for (const row of debts ?? []) {
    const { data: entries } = await supabase.from("debt_transactions").select("amount").eq("debt_id", row.id);
    results.push({
      id: row.id,
      side: row.side,
      agent: row.agent,
      originalAmount: row.initial_balance,
      remainingBalance: addMoney(row.initial_balance, sumMoney((entries ?? []).map((e) => e.amount))),
      active: row.active,
    });
  }
  return results;
}

export async function createDebt(input: DebtInput): Promise<string> {
  const supabase = await createClient();
  const user = await getUser();
  const { data, error } = await supabase
    .from("debts")
    .insert({ user_id: user.id, agent: input.agent, side: input.side, initial_balance: input.initialBalance })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function getDebtTransactions(debtId: string): Promise<DebtTransactionDTO[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("debt_transactions")
    .select("*")
    .eq("debt_id", debtId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id,
    debtId: row.debt_id,
    date: row.created_at.slice(0, 10),
    description: row.description,
    amount: row.amount,
    linkedTransactionId: row.linked_transaction_id ?? undefined,
  }));
}

/**
 * amount positive = debt increased; negative = a payment reduced it. linked_transaction_id is
 * only created when real money moved through a tracked account (createLinkedTransaction) — a
 * third party paying a bill directly leaves no `transactions` row, only this ledger entry.
 */
export async function addDebtTransaction(input: DebtTransactionInput): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();

  let linkedTransactionId: string | null = null;

  if (input.createLinkedTransaction) {
    if (!input.linkedAccountId) throw new Error("linkedAccountId is required when creating a linked transaction");
    const { data: debt } = await supabase.from("debts").select("side").eq("id", input.debtId).single();

    // A payment (negative amount) reducing a PAYABLE debt: money leaves the account (EXPENSE).
    // A payment reducing a RECEIVABLE debt: money enters the account (INCOME).
    // An increase (positive amount) on a RECEIVABLE (lending more): money leaves (EXPENSE).
    // An increase on a PAYABLE (borrowing more): money enters (INCOME).
    const isReduction = input.amount < 0;
    const type = (debt?.side === "PAYABLE") === isReduction ? "EXPENSE" : "INCOME";

    const { data: transaction, error: txError } = await supabase
      .from("transactions")
      .insert({
        user_id: user.id,
        type,
        ...(type === "EXPENSE" ? { origin_account_id: input.linkedAccountId } : { destination_account_id: input.linkedAccountId }),
        amount: Math.abs(input.amount),
        date: input.date,
        description: input.description ?? "Movimentação de dívida",
      })
      .select("id")
      .single();
    if (txError) throw new Error(txError.message);
    linkedTransactionId = transaction.id;
  }

  const { error } = await supabase.from("debt_transactions").insert({
    debt_id: input.debtId,
    amount: input.amount,
    description: input.description ?? null,
    linked_transaction_id: linkedTransactionId,
  });
  if (error) throw new Error(error.message);
}

export async function deactivateDebt(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("debts").update({ active: false }).eq("id", id);
  if (error) throw new Error(error.message);
}
