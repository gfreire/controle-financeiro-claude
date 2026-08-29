import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/getUser";
import { addMoney, sumMoney } from "@/lib/utils/money";
import { addMonthsToIsoDate, monthKey, monthsBetween, todayIso } from "@/lib/utils/date";
import type { DebtInput, DebtTransactionInput, UpdateDebtTransactionInput } from "@/lib/validations/debts";
import type { DebtDTO, DebtTransactionDTO } from "@/types/dto";

/** Whole-cent floor division — how many full `monthly` chunks fit in `total`, no float drift. */
function centsFloorDiv(total: number, unit: number): number {
  return Math.floor(Math.round(total * 100) / Math.round(unit * 100));
}

/**
 * INSTALLMENT_PLAN schedule figures, all derived (no stored column) from the ledger + the debt's
 * `monthly_amount` / `start_competence`:
 *
 * - Payments allocate to competence months oldest-first, automatically — the same heuristic
 *   `cards.service.ts#getCardSummary.currentMonthPaidAmount` uses for an invoice. `totalPaid ÷
 *   monthlyAmount` (whole cents) = how many competence months are covered, counting from
 *   `startCompetence`; `paidThroughCompetence` is the last of them. Paying two boletos today just
 *   carries credit forward and covers the next two competences — nothing is removed (unlike the
 *   card "antecipar" flow). "Se eu pago hoje uma fatura de setembro fica como pago em setembro."
 * - `scheduleOffset` = covered − expected, where `expected` is how many installments *should* be
 *   paid by today's real month (capped at the plan's total scheduled count). > 0 adiantado, < 0
 *   atrasado, 0 em dia. Today-anchored, same as the old `paidThisMonth`.
 *
 * See AI_CONTEXT.md "Parcelamento Programado — competência e adiantado/atrasado".
 */
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

  const currentMonth = monthKey(todayIso());

  const results = await Promise.all(
    (debts ?? []).map(async (row) => {
      const { data: entries } = await supabase.from("debt_transactions").select("amount, date").eq("debt_id", row.id);
      const list = entries ?? [];

      const isInstallmentPlan = row.kind === "INSTALLMENT_PLAN";
      const monthly = row.monthly_amount ?? 0;
      const startKey: string | undefined =
        isInstallmentPlan && row.start_competence ? monthKey(row.start_competence) : undefined;

      let paidThroughCompetence: string | undefined;
      let scheduleOffset: number | undefined;
      if (isInstallmentPlan && monthly > 0 && startKey) {
        const totalPaid = sumMoney(list.filter((e) => e.amount < 0).map((e) => -e.amount));
        const totalIncreased = sumMoney(list.filter((e) => e.amount > 0).map((e) => e.amount));
        const competencesCovered = centsFloorDiv(totalPaid, monthly);
        if (competencesCovered > 0) {
          paidThroughCompetence = monthKey(addMonthsToIsoDate(`${startKey}-01`, competencesCovered - 1));
        }
        const scheduledCount = Math.ceil(addMoney(row.initial_balance, totalIncreased) / monthly);
        const expected = Math.min(scheduledCount, Math.max(0, monthsBetween(startKey, currentMonth) + 1));
        scheduleOffset = competencesCovered - expected;
      }

      return {
        id: row.id,
        side: row.side,
        agent: row.agent,
        kind: row.kind,
        originalAmount: row.initial_balance,
        remainingBalance: addMoney(row.initial_balance, sumMoney(list.map((e) => e.amount))),
        active: row.active,
        defaultCategoryId: row.default_category_id ?? undefined,
        monthlyAmount: row.monthly_amount ?? undefined,
        dueDay: row.due_day ?? undefined,
        startCompetence: startKey,
        paidThroughCompetence,
        scheduleOffset,
        paidThisMonth: isInstallmentPlan
          ? list.some((e) => e.amount < 0 && monthKey(e.date) === currentMonth)
          : undefined,
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
      kind: input.kind,
      initial_balance: input.initialBalance,
      default_category_id: input.defaultCategoryId ?? null,
      monthly_amount: input.monthlyAmount ?? null,
      due_day: input.dueDay ?? null,
      start_competence: input.startCompetence ? `${input.startCompetence.slice(0, 7)}-01` : null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

/** Agent/side/kind/initialBalance/defaultCategoryId/monthlyAmount/dueDay/startCompetence are all
 * freely editable after creation — only the computed remainingBalance formula (initial_balance +
 * SUM(debt_transactions.amount)) is fixed. `startCompetence` is "since when this counts", not a
 * protected monetary value, so no history is kept (same stance as fixed_expenses.start_competence). */
export async function updateDebt(id: string, input: Partial<DebtInput>): Promise<void> {
  const supabase = await createClient();
  const updates: Record<string, unknown> = {};
  if (input.agent !== undefined) updates.agent = input.agent;
  if (input.side !== undefined) updates.side = input.side;
  if (input.kind !== undefined) updates.kind = input.kind;
  if (input.initialBalance !== undefined) updates.initial_balance = input.initialBalance;
  if (input.defaultCategoryId !== undefined) updates.default_category_id = input.defaultCategoryId;
  if (input.monthlyAmount !== undefined) updates.monthly_amount = input.monthlyAmount;
  if (input.dueDay !== undefined) updates.due_day = input.dueDay;
  if (input.startCompetence !== undefined)
    updates.start_competence = input.startCompetence ? `${input.startCompetence.slice(0, 7)}-01` : null;
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

    // A debt movement always passes through real money in a cash/bank account — never a credit
    // card. "Se a dívida é no cartão, ela é uma compra no cartão", not a debt (the create-side
    // UI already passes only liquidAccounts, this guards any other/future caller — same
    // never-trust-the-client stance as payFixedExpense reading the account type server-side).
    const { data: linkedAccount, error: linkedAccountError } = await supabase
      .from("accounts")
      .select("type")
      .eq("id", input.linkedAccountId)
      .single();
    if (linkedAccountError) throw new Error(linkedAccountError.message);
    if (linkedAccount.type === "CREDIT_CARD") {
      throw new Error("Um pagamento de dívida sai de uma conta em dinheiro ou banco — se a dívida é no cartão, registre-a como compra no cartão.");
    }

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
