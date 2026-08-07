import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/getUser";
import type { TransactionInput } from "@/lib/validations/transactions";
import type { TransactionViewDTO } from "@/types/dto";
import type { TransactionRow } from "@/types/database";

export type TransactionFilters = {
  periodStart?: string;
  periodEnd?: string;
  accountId?: string;
  categoryId?: string;
  subcategoryId?: string;
  type?: "INCOME" | "EXPENSE" | "TRANSFER" | "CREDIT_CARD_PAYMENT";
};

export async function createTransaction(input: TransactionInput): Promise<string> {
  const supabase = await createClient();
  const user = await getUser();

  const { data, error } = await supabase
    .from("transactions")
    .insert({
      user_id: user.id,
      type: input.type,
      origin_account_id: input.originAccountId ?? null,
      destination_account_id: input.destinationAccountId ?? null,
      amount: input.amount,
      date: input.date,
      description: input.description ?? null,
      category_id: input.categoryId ?? null,
      subcategory_id: input.subcategoryId ?? null,
      fixed_expense_id: input.fixedExpenseId ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function updateTransaction(id: string, input: Partial<TransactionInput>): Promise<void> {
  const supabase = await createClient();
  const patch: Record<string, unknown> = {};
  if (input.type !== undefined) patch.type = input.type;
  if (input.originAccountId !== undefined) patch.origin_account_id = input.originAccountId;
  if (input.destinationAccountId !== undefined) patch.destination_account_id = input.destinationAccountId;
  if (input.amount !== undefined) patch.amount = input.amount;
  if (input.date !== undefined) patch.date = input.date;
  if (input.description !== undefined) patch.description = input.description;
  if (input.categoryId !== undefined) patch.category_id = input.categoryId;
  if (input.subcategoryId !== undefined) patch.subcategory_id = input.subcategoryId;

  const { error } = await supabase.from("transactions").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteTransaction(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getTransactions(filters: TransactionFilters = {}): Promise<TransactionViewDTO[]> {
  const supabase = await createClient();
  const user = await getUser();

  let query = supabase
    .from("transactions")
    .select(
      "id, date, description, type, amount, category_id, subcategory_id, origin_account_id, destination_account_id, categories(name), subcategories(name), origin:accounts!transactions_origin_account_id_fkey(name), destination:accounts!transactions_destination_account_id_fkey(name)"
    )
    .eq("user_id", user.id)
    .order("date", { ascending: false });

  if (filters.periodStart) query = query.gte("date", filters.periodStart);
  if (filters.periodEnd) query = query.lte("date", filters.periodEnd);
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
  if (filters.subcategoryId) query = query.eq("subcategory_id", filters.subcategoryId);
  if (filters.type) query = query.eq("type", filters.type);
  if (filters.accountId) query = query.or(`origin_account_id.eq.${filters.accountId},destination_account_id.eq.${filters.accountId}`);

  const { data: rawData, error } = await query;
  if (error) throw new Error(error.message);
  const data = (rawData ?? []) as unknown as Array<{
    id: string;
    date: string;
    description: string | null;
    type: TransactionRow["type"];
    amount: number;
    category_id: string | null;
    subcategory_id: string | null;
    origin_account_id: string | null;
    destination_account_id: string | null;
    categories: { name: string } | null;
    subcategories: { name: string } | null;
    origin: { name: string } | null;
    destination: { name: string } | null;
  }>;

  return data.map((row) => ({
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
    amount: row.amount,
    source: "transaction" as const,
  }));
}
