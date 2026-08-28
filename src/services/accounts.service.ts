import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/getUser";
import { addMoney, subtractMoney, sumMoney } from "@/lib/utils/money";
import { todayIso } from "@/lib/utils/date";
import { createCardPurchase } from "./cards.service";
import type { AccountDTO, FinancialInstitutionDTO } from "@/types/dto";
import type { AccountInput } from "@/lib/validations/accounts";

export async function getFinancialInstitutions(): Promise<FinancialInstitutionDTO[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("financial_institutions").select("*").order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ id: row.id, name: row.name, color: row.color }));
}

/**
 * Balance per account type:
 * - CASH / BANK: initial_balance + SUM(transactions affecting the account).
 * - CREDIT_CARD: outstanding debt = SUM(card_installments) - SUM(card_payments), a total-to-date
 *   view (cards.service exposes the per-invoice breakdown for the Cards screen).
 */
export async function getAccountBalance(accountId: string): Promise<number> {
  const supabase = await createClient();

  const { data: account, error } = await supabase.from("accounts").select("type").eq("id", accountId).single();
  if (error) throw new Error(error.message);

  if (account.type === "CREDIT_CARD") {
    const [{ data: installments }, { data: payments }] = await Promise.all([
      supabase.from("card_installments").select("amount").eq("credit_card_id", accountId),
      supabase.from("card_payments").select("amount").eq("credit_card_id", accountId),
    ]);
    const totalInstallments = sumMoney((installments ?? []).map((i) => i.amount));
    const totalPayments = sumMoney((payments ?? []).map((p) => p.amount));
    return -subtractMoney(totalInstallments, totalPayments);
  }

  let initial = 0;
  if (account.type === "CASH") {
    const { data: cash } = await supabase.from("cash_accounts").select("initial_balance").eq("account_id", accountId).single();
    initial = cash?.initial_balance ?? 0;
  } else if (account.type === "BANK") {
    const { data: bank } = await supabase.from("bank_accounts").select("initial_balance").eq("account_id", accountId).single();
    initial = bank?.initial_balance ?? 0;
  }

  const [{ data: outgoing }, { data: incoming }] = await Promise.all([
    supabase.from("transactions").select("amount").eq("origin_account_id", accountId),
    supabase.from("transactions").select("amount").eq("destination_account_id", accountId),
  ]);

  const totalOut = sumMoney((outgoing ?? []).map((t) => t.amount));
  const totalIn = sumMoney((incoming ?? []).map((t) => t.amount));
  return addMoney(initial, subtractMoney(totalIn, totalOut));
}

export async function getAccounts(): Promise<AccountDTO[]> {
  const supabase = await createClient();
  const user = await getUser();

  const { data: accounts, error } = await supabase
    .from("accounts")
    .select("*, financial_institutions(name, color), cash_accounts(initial_balance), bank_accounts(initial_balance, overdraft_limit), credit_cards(closing_day, due_day, credit_limit)")
    .eq("user_id", user.id)
    .eq("active", true)
    .order("name");
  if (error) throw new Error(error.message);

  const typeOrder: Record<string, number> = { CASH: 0, BANK: 1, CREDIT_CARD: 2 };
  const sorted = [...(accounts ?? [])].sort((a, b) => {
    const diff = (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99);
    return diff !== 0 ? diff : a.name.localeCompare(b.name);
  });

  const balances = await Promise.all(sorted.map((a) => getAccountBalance(a.id)));

  return sorted.map((row, index) => ({
    id: row.id,
    type: row.type,
    name: row.name,
    color: row.color,
    active: row.active,
    institutionId: row.institution_id,
    institutionName: row.financial_institutions?.name ?? null,
    institutionColor: row.financial_institutions?.color ?? null,
    balance: balances[index],
    initialBalance: row.cash_accounts?.initial_balance ?? row.bank_accounts?.initial_balance,
    overdraftLimit: row.bank_accounts?.overdraft_limit,
    closingDay: row.credit_cards?.closing_day,
    dueDay: row.credit_cards?.due_day,
    creditLimit: row.credit_cards?.credit_limit,
  }));
}

export async function createAccount(input: AccountInput): Promise<AccountDTO> {
  const supabase = await createClient();
  const user = await getUser();

  const { data: account, error } = await supabase
    .from("accounts")
    .insert({ user_id: user.id, type: input.type, name: input.name, institution_id: input.institutionId ?? null, color: input.color ?? null })
    .select()
    .single();
  if (error) throw new Error(error.message);

  if (input.type === "CASH") {
    const { error: extError } = await supabase.from("cash_accounts").insert({ account_id: account.id, initial_balance: input.initialBalance ?? 0 });
    if (extError) throw new Error(extError.message);
  } else if (input.type === "BANK") {
    const { error: extError } = await supabase
      .from("bank_accounts")
      .insert({ account_id: account.id, initial_balance: input.initialBalance ?? 0, overdraft_limit: input.overdraftLimit ?? 0 });
    if (extError) throw new Error(extError.message);
  } else if (input.type === "CREDIT_CARD") {
    const { error: extError } = await supabase
      .from("credit_cards")
      .insert({ account_id: account.id, closing_day: input.closingDay, due_day: input.dueDay, credit_limit: input.creditLimit ?? null });
    if (extError) throw new Error(extError.message);
  }

  return {
    id: account.id,
    type: account.type,
    name: account.name,
    color: account.color,
    active: account.active,
    institutionId: account.institution_id,
    institutionName: null,
    institutionColor: null,
    balance: input.type === "CASH" || input.type === "BANK" ? (input.initialBalance ?? 0) : 0,
    initialBalance: input.initialBalance,
    overdraftLimit: input.overdraftLimit,
    closingDay: input.closingDay,
    dueDay: input.dueDay,
    creditLimit: input.creditLimit,
  };
}

export async function updateAccount(id: string, input: Partial<AccountInput>): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("accounts")
    .update({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.institutionId !== undefined ? { institution_id: input.institutionId } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  if (input.initialBalance !== undefined) {
    let type = input.type;
    if (!type) {
      const { data: existing } = await supabase.from("accounts").select("type").eq("id", id).single();
      type = existing?.type;
    }
    const table = type === "BANK" ? "bank_accounts" : "cash_accounts";
    const { error: extError } = await supabase.from(table).update({ initial_balance: input.initialBalance }).eq("account_id", id);
    if (extError) throw new Error(extError.message);
  }
  if (input.overdraftLimit !== undefined) {
    const { error: extError } = await supabase.from("bank_accounts").update({ overdraft_limit: input.overdraftLimit }).eq("account_id", id);
    if (extError) throw new Error(extError.message);
  }
  if (input.closingDay !== undefined || input.dueDay !== undefined || input.creditLimit !== undefined) {
    const { error: extError } = await supabase
      .from("credit_cards")
      .update({
        ...(input.closingDay !== undefined ? { closing_day: input.closingDay } : {}),
        ...(input.dueDay !== undefined ? { due_day: input.dueDay } : {}),
        ...(input.creditLimit !== undefined ? { credit_limit: input.creditLimit } : {}),
      })
      .eq("account_id", id);
    if (extError) throw new Error(extError.message);
  }
}

/** Soft-delete by convention (see AI_GENERATION_RULES.md) — hard delete is a last resort once real history exists. */
export async function deactivateAccount(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("accounts").update({ active: false }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteAccount(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("accounts").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

async function findOrCreateSystemCategory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  name: "Rendimentos" | "Ajuste" | "Juros",
  type: "INCOME" | "EXPENSE"
): Promise<string> {
  const { data, error } = await supabase
    .from("categories")
    .select("id")
    .eq("is_system", true)
    .eq("name", name)
    .eq("type", type)
    .single();
  if (error) throw new Error(`Categoria de sistema "${name}" (${type}) não encontrada — verifique o seed`);
  return data.id;
}

/** "Informar Rendimento": compares realBalance to the calculated balance and logs the difference as INCOME/Rendimentos. */
export async function registerYield(accountId: string, realBalance: number): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();

  const [calculated, { data: account }] = await Promise.all([
    getAccountBalance(accountId),
    supabase.from("accounts").select("name").eq("id", accountId).single(),
  ]);
  const delta = subtractMoney(realBalance, calculated);
  if (delta === 0) return;

  const categoryId = await findOrCreateSystemCategory(supabase, "Rendimentos", "INCOME");
  const { error } = await supabase.from("transactions").insert({
    user_id: user.id,
    type: "INCOME",
    destination_account_id: accountId,
    amount: Math.abs(delta),
    date: new Date().toISOString().slice(0, 10),
    category_id: categoryId,
    description: `Informar Rendimento — ${account?.name ?? ""}`.trim(),
  });
  if (error) throw new Error(error.message);
}

/** "Ajustar Saldo": same delta calculation, tagged Ajuste (system category, INCOME or EXPENSE matching the sign) instead of Rendimentos. */
export async function reconcileAccountBalance(accountId: string, realBalance: number): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();

  const [calculated, { data: account }] = await Promise.all([
    getAccountBalance(accountId),
    supabase.from("accounts").select("name").eq("id", accountId).single(),
  ]);
  const delta = subtractMoney(realBalance, calculated);
  if (delta === 0) return;

  const type = delta > 0 ? "INCOME" : "EXPENSE";
  const categoryId = await findOrCreateSystemCategory(supabase, "Ajuste", type);

  const { error } = await supabase.from("transactions").insert({
    user_id: user.id,
    type,
    ...(type === "INCOME" ? { destination_account_id: accountId } : { origin_account_id: accountId }),
    amount: Math.abs(delta),
    date: new Date().toISOString().slice(0, 10),
    category_id: categoryId,
    description: `Ajustar Saldo — ${account?.name ?? ""}`.trim(),
  });
  if (error) throw new Error(error.message);
}

/**
 * "Lançar Juros" — a dedicated action for logging interest, tagged with the `is_system` `Juros`
 * (EXPENSE) category (AI_CONTEXT.md "Juros"). Unlike `registerYield`/`reconcileAccountBalance` it
 * takes an explicit amount, not a delta against a stated balance. The account's own `type` — read
 * from the DB, never the client — decides how it's recorded, mirroring `payFixedExpense`:
 * - CASH/BANK → a plain EXPENSE `transactions` row against the account (e.g. overdraft interest);
 * - CREDIT_CARD → a 1x `card_purchases` row (the invoice's interest line), so it flows through the
 *   normal card_purchases → card_installments pipeline with competence derived from closing/due day.
 * `Juros` is never pickable from a category dropdown — this is the only way to apply it.
 */
export async function registerInterest(input: { accountId: string; amount: number; date?: string }): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  if (input.amount <= 0) return;

  const { data: account, error } = await supabase.from("accounts").select("name, type").eq("id", input.accountId).single();
  if (error) throw new Error(error.message);

  const date = input.date ?? todayIso();
  const description = `Lançamento de juros — ${account.name ?? ""}`.trim();
  const categoryId = await findOrCreateSystemCategory(supabase, "Juros", "EXPENSE");

  if (account.type === "CREDIT_CARD") {
    await createCardPurchase({
      creditCardId: input.accountId,
      amount: input.amount,
      purchaseDate: date,
      description,
      categoryId,
      installments: 1,
    });
    return;
  }

  const { error: txError } = await supabase.from("transactions").insert({
    user_id: user.id,
    type: "EXPENSE",
    origin_account_id: input.accountId,
    amount: input.amount,
    date,
    category_id: categoryId,
    description,
  });
  if (txError) throw new Error(txError.message);
}
