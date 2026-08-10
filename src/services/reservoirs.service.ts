import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/getUser";
import { sumMoney } from "@/lib/utils/money";
import type {
  ReservoirAccrualInput,
  ReservoirInput,
  ReservoirWithdrawalInput,
  UpdateReservoirAccrualInput,
  UpdateReservoirInput,
} from "@/lib/validations/reservoirs";
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

  const results = await Promise.all(
    (reservoirs ?? []).map(async (row) => {
      const { data: entries } = await supabase.from("reservoir_transactions").select("amount").eq("reservoir_id", row.id);
      return {
        id: row.id,
        name: row.name,
        balance: sumMoney((entries ?? []).map((e) => e.amount)),
        categoryId: row.category_id,
        categoryName: row.categories?.name ?? null,
        defaultPercentage: row.default_percentage ?? undefined,
        defaultDestinationAccountId: row.default_destination_account_id ?? undefined,
      };
    })
  );
  return results;
}

export async function createReservoir(input: ReservoirInput): Promise<string> {
  const supabase = await createClient();
  const user = await getUser();
  const { data, error } = await supabase
    .from("reservoirs")
    .insert({
      user_id: user.id,
      name: input.name,
      category_id: input.categoryId ?? null,
      subcategory_id: input.subcategoryId ?? null,
      default_percentage: input.defaultPercentage ?? null,
      default_destination_account_id: input.defaultDestinationAccountId ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function updateReservoir(input: UpdateReservoirInput): Promise<void> {
  const supabase = await createClient();
  const { id, ...rest } = input;
  const updates: Record<string, unknown> = {};
  if (rest.name !== undefined) updates.name = rest.name;
  if (rest.categoryId !== undefined) updates.category_id = rest.categoryId;
  if (rest.subcategoryId !== undefined) updates.subcategory_id = rest.subcategoryId;
  if (rest.defaultPercentage !== undefined) updates.default_percentage = rest.defaultPercentage;
  if (rest.defaultDestinationAccountId !== undefined) updates.default_destination_account_id = rest.defaultDestinationAccountId;

  const { error } = await supabase.from("reservoirs").update(updates).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getReservoirTransactions(reservoirId: string): Promise<ReservoirTransactionDTO[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reservoir_transactions")
    .select("*")
    .eq("reservoir_id", reservoirId)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id,
    reservoirId: row.reservoir_id,
    date: row.date,
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
    date: input.date,
  });
  if (error) throw new Error(error.message);
}

/** Edits an accrual entry (date/amount/grossAmount/percentage/description). Withdrawals stay
 * linked to their transaction and are never edited through this path. */
export async function updateReservoirTransaction(input: UpdateReservoirAccrualInput): Promise<void> {
  const supabase = await createClient();
  const { data: existing, error: fetchError } = await supabase
    .from("reservoir_transactions")
    .select("linked_transaction_id, linked_card_purchase_id")
    .eq("id", input.id)
    .single();
  if (fetchError) throw new Error(fetchError.message);
  if (existing.linked_transaction_id || existing.linked_card_purchase_id) {
    throw new Error("Não é possível editar um lançamento de saque.");
  }

  const { error } = await supabase
    .from("reservoir_transactions")
    .update({
      date: input.date,
      amount: input.amount,
      gross_amount: input.grossAmount ?? null,
      percentage: input.percentage ?? null,
      description: input.description ?? null,
    })
    .eq("id", input.id);
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
    date: input.date,
    linked_transaction_id: transaction.id,
  });
  if (error) throw new Error(error.message);
}

export async function deactivateReservoir(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("reservoirs").update({ active: false }).eq("id", id);
  if (error) throw new Error(error.message);
}
