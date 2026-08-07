import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/getUser";
import { sumMoney } from "@/lib/utils/money";
import type { ReservoirAccrualInput, ReservoirInput, ReservoirWithdrawalInput } from "@/lib/validations/reservoirs";
import type { ReservoirDTO, ReservoirTransactionDTO } from "@/types/dto";

export async function getReservoirs(): Promise<ReservoirDTO[]> {
  const supabase = await createClient();
  const user = await getUser();

  const { data: reservoirs, error } = await supabase
    .from("reservoirs")
    .select("*, categories(name)")
    .eq("user_id", user.id)
    .eq("active", true)
    .order("name");
  if (error) throw new Error(error.message);

  const results: ReservoirDTO[] = [];
  for (const row of reservoirs ?? []) {
    const { data: entries } = await supabase.from("reservoir_transactions").select("amount").eq("reservoir_id", row.id);
    results.push({
      id: row.id,
      name: row.name,
      balance: sumMoney((entries ?? []).map((e) => e.amount)),
      categoryId: row.category_id,
      categoryName: row.categories?.name ?? null,
    });
  }
  return results;
}

export async function createReservoir(input: ReservoirInput): Promise<string> {
  const supabase = await createClient();
  const user = await getUser();
  const { data, error } = await supabase
    .from("reservoirs")
    .insert({ user_id: user.id, name: input.name, category_id: input.categoryId ?? null, subcategory_id: input.subcategoryId ?? null })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function getReservoirTransactions(reservoirId: string): Promise<ReservoirTransactionDTO[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reservoir_transactions")
    .select("*")
    .eq("reservoir_id", reservoirId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id,
    reservoirId: row.reservoir_id,
    date: row.created_at.slice(0, 10),
    description: row.description,
    amount: row.amount,
    grossAmount: row.gross_amount ?? undefined,
    percentage: row.percentage ?? undefined,
    linkedTransactionId: row.linked_transaction_id ?? undefined,
    linkedCardPurchaseId: row.linked_card_purchase_id ?? undefined,
  }));
}

/** Accumulation entry — logged as soon as a value is known/estimated. amount is always positive. */
export async function addReservoirTransaction(input: ReservoirAccrualInput): Promise<void> {
  const supabase = await createClient();
  const { data: reservoir } = await supabase.from("reservoirs").select("name").eq("id", input.reservoirId).single();
  const description = input.description ?? `Movimentação da receita programada ${reservoir?.name ?? ""}`.trim();

  const { error } = await supabase.from("reservoir_transactions").insert({
    reservoir_id: input.reservoirId,
    amount: input.amount,
    gross_amount: input.grossAmount ?? null,
    percentage: input.percentage ?? null,
    description,
  });
  if (error) throw new Error(error.message);
}

/**
 * Withdrawal — money actually received, moved to a real account. Creates a linked INCOME
 * transaction and a negative reservoir_transactions entry. The withdrawn amount does not need
 * to match the accumulated total; the difference simply carries forward in the balance.
 */
export async function withdrawReservoir(input: ReservoirWithdrawalInput): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();

  const { data: reservoir } = await supabase.from("reservoirs").select("name, category_id, subcategory_id").eq("id", input.reservoirId).single();
  const description = input.description ?? `Movimentação da receita programada ${reservoir?.name ?? ""}`.trim();

  const { data: transaction, error: txError } = await supabase
    .from("transactions")
    .insert({
      user_id: user.id,
      type: "INCOME",
      destination_account_id: input.destinationAccountId,
      amount: input.amount,
      date: input.date,
      description,
      category_id: input.categoryId ?? reservoir?.category_id ?? null,
      subcategory_id: input.subcategoryId ?? reservoir?.subcategory_id ?? null,
      is_reservoir: true,
    })
    .select("id")
    .single();
  if (txError) throw new Error(txError.message);

  const { error } = await supabase.from("reservoir_transactions").insert({
    reservoir_id: input.reservoirId,
    amount: -input.amount,
    description,
    linked_transaction_id: transaction.id,
  });
  if (error) throw new Error(error.message);
}

export async function deactivateReservoir(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("reservoirs").update({ active: false }).eq("id", id);
  if (error) throw new Error(error.message);
}
