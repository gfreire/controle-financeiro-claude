import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/getUser";
import { sumMoney, subtractMoney, addMoney, roundMoney } from "@/lib/utils/money";
import { monthKey, monthsBetween, addMonthsToIsoDate, todayIso, endOfMonth, formatMonthLabel } from "@/lib/utils/date";
import type {
  GoalInput,
  UpdateGoalInput,
  GoalReserveInput,
  GoalRedeemInput,
  GoalYieldInput,
  UpdateGoalEntryInput,
  UpdateGoalYieldInput,
} from "@/lib/validations/goals";
import type { GoalDTO, GoalEntryDTO, GoalStatus, GoalsOverviewDTO, GoalAccumulationDTO } from "@/types/dto";

/**
 * Metas ("Goals"). Mirror-image of the Reservoir feature — money the user already has and is
 * setting aside toward an objective. See AI_CONTEXT.md "Metas".
 *
 * - Aporte / resgate = `transactions` RESERVE / REDEEM: real money leaves / re-enters a CASH/BANK
 *   account, but never counts as INCOME/EXPENSE (analytics queries restrict `type`).
 * - Rendimento = `goal_yields`: dinheiro novo, entra no dashboard como RECEITA sintética sob
 *   "Rendimentos" (never a real transaction — same as "Compras retroativas").
 * - currentBalance = Σ RESERVE − Σ REDEEM + Σ goal_yields, always computed, never stored.
 * - Schedule figures (adiantado/atrasado) follow the INSTALLMENT_PLAN pattern (migration 0032),
 *   always today-anchored. A rebase (endDate edit / "Recalcular") only moves `anchor_date` and
 *   recomputes `monthly_contribution` — it never touches the ledger.
 */

const firstOfMonth = (yyyymm: string): string => `${yyyymm.slice(0, 7)}-01`;

/** Σ RESERVE − Σ REDEEM + Σ goal_yields for one goal — the "book balance". */
async function computeGoalBalance(
  supabase: Awaited<ReturnType<typeof createClient>>,
  goalId: string
): Promise<number> {
  const [{ data: txs }, { data: yields }] = await Promise.all([
    supabase.from("transactions").select("amount, type").eq("goal_id", goalId).in("type", ["RESERVE", "REDEEM"]),
    supabase.from("goal_yields").select("amount").eq("goal_id", goalId),
  ]);
  const reserved = sumMoney((txs ?? []).filter((t) => t.type === "RESERVE").map((t) => t.amount));
  const redeemed = sumMoney((txs ?? []).filter((t) => t.type === "REDEEM").map((t) => t.amount));
  const yielded = sumMoney((yields ?? []).map((y) => y.amount));
  return addMoney(subtractMoney(reserved, redeemed), yielded);
}

/** The two `is_system` INCOME categories a REDEEM is tagged with (migration 0036). Cached per request. */
const getRedeemCategories = cache(async (): Promise<{ completedId: string; earlyId: string }> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name")
    .eq("is_system", true)
    .eq("type", "INCOME")
    .in("name", ["Resgate de Meta Concluída", "Resgate de Meta Antecipado"]);
  if (error) throw new Error(error.message);
  const completedId = data?.find((c) => c.name === "Resgate de Meta Concluída")?.id;
  const earlyId = data?.find((c) => c.name === "Resgate de Meta Antecipado")?.id;
  if (!completedId || !earlyId) throw new Error("Categorias system de resgate de meta não encontradas — verifique o seed (migration 0036)");
  return { completedId, earlyId };
});

function scheduleFor(
  row: { goal_target: number; monthly_contribution: number | null; anchor_date: string; end_date: string | null },
  currentBalance: number,
  anchorBalance: number
): {
  status: GoalStatus;
  scheduleOffsetMonths?: number;
  expectedByNow?: number;
  projectedCompletionMonth?: string;
} {
  const reached = currentBalance >= row.goal_target;
  const monthly = row.monthly_contribution ?? 0;

  if (reached) return { status: "REACHED" };
  if (monthly <= 0) return { status: "NO_SCHEDULE" };

  const currentMonth = monthKey(todayIso());
  const anchorMonth = monthKey(row.anchor_date);
  const monthsElapsed = Math.max(0, monthsBetween(anchorMonth, currentMonth));
  const expectedRaw = addMoney(anchorBalance, roundMoney(monthly * monthsElapsed));
  const expectedByNow = Math.min(expectedRaw, row.goal_target);

  const scheduleOffsetMonths = Math.round(subtractMoney(currentBalance, expectedByNow) / monthly);
  const status: GoalStatus = scheduleOffsetMonths > 0 ? "AHEAD" : scheduleOffsetMonths < 0 ? "BEHIND" : "ON_TRACK";

  const remaining = subtractMoney(row.goal_target, currentBalance);
  const monthsNeeded = Math.max(1, Math.ceil(remaining / monthly));
  const projectedCompletionMonth = monthKey(addMonthsToIsoDate(`${currentMonth}-01`, monthsNeeded));

  return { status, scheduleOffsetMonths, expectedByNow, projectedCompletionMonth };
}

export async function getGoals(): Promise<GoalDTO[]> {
  const supabase = await createClient();
  const user = await getUser();

  const { data: goalRows, error } = await supabase
    .from("goals")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at");
  if (error) throw new Error(error.message);
  if (!goalRows?.length) return [];

  const goalIds = goalRows.map((g) => g.id);
  const [{ data: txRows }, { data: yieldRows }] = await Promise.all([
    supabase.from("transactions").select("goal_id, amount, type, date").in("goal_id", goalIds).in("type", ["RESERVE", "REDEEM"]),
    supabase.from("goal_yields").select("goal_id, amount, date").in("goal_id", goalIds),
  ]);

  return goalRows.map((row) => {
    const txs = (txRows ?? []).filter((t) => t.goal_id === row.id);
    const yields = (yieldRows ?? []).filter((y) => y.goal_id === row.id);

    const contributedTotal = sumMoney(txs.filter((t) => t.type === "RESERVE").map((t) => t.amount));
    const withdrawnTotal = sumMoney(txs.filter((t) => t.type === "REDEEM").map((t) => t.amount));
    const yieldTotal = sumMoney(yields.map((y) => y.amount));
    const currentBalance = addMoney(subtractMoney(contributedTotal, withdrawnTotal), yieldTotal);

    // "What was already achieved" at the schedule's anchor — computed live from the immutable
    // ledger (entries dated on/before anchor_date), so a rebase never needs to snapshot a value.
    const anchorReserved = sumMoney(txs.filter((t) => t.type === "RESERVE" && t.date <= row.anchor_date).map((t) => t.amount));
    const anchorRedeemed = sumMoney(txs.filter((t) => t.type === "REDEEM" && t.date <= row.anchor_date).map((t) => t.amount));
    const anchorYield = sumMoney(yields.filter((y) => y.date <= row.anchor_date).map((y) => y.amount));
    const anchorBalance = addMoney(subtractMoney(anchorReserved, anchorRedeemed), anchorYield);

    const sched = scheduleFor(row, currentBalance, anchorBalance);
    const progressPercent = row.goal_target > 0 ? Math.min(100, Math.max(0, Math.round((currentBalance / row.goal_target) * 100))) : 0;

    return {
      id: row.id,
      name: row.name,
      goalTarget: row.goal_target,
      currentBalance,
      contributedTotal,
      withdrawnTotal,
      yieldTotal,
      progressPercent,
      startCompetence: monthKey(row.start_competence),
      anchorDate: row.anchor_date,
      endDate: row.end_date ? monthKey(row.end_date) : undefined,
      monthlyContribution: row.monthly_contribution ?? undefined,
      ...sched,
    };
  });
}

export async function getGoalEntries(goalId: string): Promise<GoalEntryDTO[]> {
  const supabase = await createClient();

  const [{ data: txData, error: txError }, { data: yieldData, error: yieldError }, redeemCategories] = await Promise.all([
    supabase
      .from("transactions")
      .select(
        "id, type, amount, date, description, category_id, origin:accounts!transactions_origin_account_id_fkey(id, name), destination:accounts!transactions_destination_account_id_fkey(id, name)"
      )
      .eq("goal_id", goalId)
      .in("type", ["RESERVE", "REDEEM"]),
    supabase.from("goal_yields").select("id, amount, date, description").eq("goal_id", goalId),
    getRedeemCategories(),
  ]);
  if (txError) throw new Error(txError.message);
  if (yieldError) throw new Error(yieldError.message);

  const txs = (txData ?? []) as unknown as Array<{
    id: string;
    type: "RESERVE" | "REDEEM";
    amount: number;
    date: string;
    description: string | null;
    category_id: string | null;
    origin: { id: string; name: string } | null;
    destination: { id: string; name: string } | null;
  }>;

  const entries: GoalEntryDTO[] = txs.map((t) => {
    const account = t.type === "RESERVE" ? t.origin : t.destination;
    return {
      id: t.id,
      kind: t.type,
      date: t.date,
      description: t.description,
      amount: t.amount,
      accountId: account?.id,
      accountName: account?.name,
      withdrawalReason:
        t.type === "REDEEM"
          ? t.category_id === redeemCategories.earlyId
            ? "EARLY"
            : "COMPLETED"
          : undefined,
    };
  });

  for (const y of yieldData ?? []) {
    entries.push({ id: y.id, kind: "YIELD", date: y.date, description: y.description, amount: y.amount });
  }

  return entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

async function insertReserve(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  input: { goalId: string; goalName: string; accountId: string; amount: number; date: string; description?: string | null }
): Promise<void> {
  const { data: account, error: accountError } = await supabase.from("accounts").select("type").eq("id", input.accountId).single();
  if (accountError) throw new Error(accountError.message);
  if (account.type === "CREDIT_CARD") {
    throw new Error("Um aporte para meta sai de uma conta em dinheiro ou banco, nunca de um cartão.");
  }
  const description = input.description?.trim() || `Aporte para meta ${input.goalName}`;
  const { error } = await supabase.from("transactions").insert({
    user_id: userId,
    type: "RESERVE",
    origin_account_id: input.accountId,
    goal_id: input.goalId,
    amount: input.amount,
    date: input.date,
    description,
  });
  if (error) throw new Error(error.message);
}

export async function createGoal(input: GoalInput): Promise<string> {
  const supabase = await createClient();
  const user = await getUser();

  const startFirst = firstOfMonth(input.startCompetence);
  const endFirst = input.endDate ? firstOfMonth(input.endDate) : null;
  const initialAmount = input.initialReserveAmount ?? 0;

  let monthly = input.monthlyContribution ?? null;
  if (endFirst && (monthly === null || monthly === undefined)) {
    const months = Math.max(1, monthsBetween(monthKey(startFirst), monthKey(endFirst)));
    const computed = roundMoney(Math.max(0, subtractMoney(input.goalTarget, initialAmount)) / months);
    monthly = computed > 0 ? computed : null;
  }

  const { data, error } = await supabase
    .from("goals")
    .insert({
      user_id: user.id,
      name: input.name,
      goal_target: input.goalTarget,
      start_competence: startFirst,
      end_date: endFirst,
      monthly_contribution: monthly,
      anchor_date: startFirst,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  if (initialAmount > 0 && input.initialReserveAccountId) {
    // Dated at start_competence so it lands inside the schedule's anchor balance (the "já
    // comecei com R$ X" starting point), not counted as a later contribution.
    await insertReserve(supabase, user.id, {
      goalId: data.id,
      goalName: input.name,
      accountId: input.initialReserveAccountId,
      amount: initialAmount,
      date: startFirst,
      description: `Reserva inicial da meta ${input.name}`,
    });
  }

  return data.id;
}

/**
 * Partial field update. A "rebase" — `rebase: true` (the "Recalcular" button) or a changed
 * `endDate` — snapshots the schedule to today: `anchor_date = today` and, unless the caller also
 * passed an explicit `monthlyContribution`, recomputes it from the current live balance. The
 * ledger is never touched — "quanto já foi feito" is always the balance computed at anchor_date.
 */
export async function updateGoal(id: string, input: Omit<UpdateGoalInput, "id">): Promise<void> {
  const supabase = await createClient();

  const { data: current, error: fetchError } = await supabase.from("goals").select("*").eq("id", id).single();
  if (fetchError) throw new Error(fetchError.message);

  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.goalTarget !== undefined) updates.goal_target = input.goalTarget;
  if (input.startCompetence !== undefined) updates.start_competence = firstOfMonth(input.startCompetence);
  if (input.monthlyContribution !== undefined) updates.monthly_contribution = input.monthlyContribution;

  const nextEnd = input.endDate !== undefined ? (input.endDate ? firstOfMonth(input.endDate) : null) : current.end_date;
  const endChanged = input.endDate !== undefined && nextEnd !== current.end_date;
  if (input.endDate !== undefined) updates.end_date = nextEnd;

  const shouldRebase = input.rebase === true || (endChanged && nextEnd !== null);
  if (shouldRebase) {
    const today = todayIso();
    updates.anchor_date = today;
    if (nextEnd && input.monthlyContribution === undefined) {
      const balance = await computeGoalBalance(supabase, id);
      const target = (updates.goal_target as number | undefined) ?? current.goal_target;
      const months = Math.max(1, monthsBetween(monthKey(today), monthKey(nextEnd)));
      const computed = roundMoney(Math.max(0, subtractMoney(target, balance)) / months);
      updates.monthly_contribution = computed > 0 ? computed : null;
    }
  }

  const { error } = await supabase.from("goals").update(updates).eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Hard delete — a goal needs no guided-reassignment flow. `goal_yields` cascades away with it
 * (ON DELETE CASCADE); the RESERVE/REDEEM `transactions` rows survive with `goal_id` set NULL, so
 * the real money history stays in Movimentações (same principle as deleteReservoir).
 */
export async function deleteGoal(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("goals").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Aporte — real money moves from a CASH/BANK account into the goal. */
export async function addReserve(input: GoalReserveInput): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const { data: goal, error } = await supabase.from("goals").select("name").eq("id", input.goalId).single();
  if (error) throw new Error(error.message);
  await insertReserve(supabase, user.id, {
    goalId: input.goalId,
    goalName: goal.name,
    accountId: input.accountId,
    amount: input.amount,
    date: input.date,
    description: input.description,
  });
}

/**
 * Resgate — one REDEEM transaction for the full `amount` (money into a CASH/BANK account, tagged
 * with the COMPLETED/EARLY system category). If `amount` exceeds the current book balance, the
 * excess is unreported yield being recognized now — logged as a `goal_yields` row linked to this
 * REDEEM (so it cascades away if the REDEEM is deleted). No new account movement for that part;
 * the money already came in via the REDEEM.
 */
export async function redeemGoal(input: GoalRedeemInput): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();

  const { data: account, error: accountError } = await supabase.from("accounts").select("type").eq("id", input.accountId).single();
  if (accountError) throw new Error(accountError.message);
  if (account.type === "CREDIT_CARD") {
    throw new Error("Um resgate de meta vai para uma conta em dinheiro ou banco, nunca um cartão.");
  }

  const { data: goal, error: goalError } = await supabase.from("goals").select("name, goal_target").eq("id", input.goalId).single();
  if (goalError) throw new Error(goalError.message);

  const bookBalance = await computeGoalBalance(supabase, input.goalId);
  const reason = input.reason ?? (bookBalance >= goal.goal_target ? "COMPLETED" : "EARLY");
  const { completedId, earlyId } = await getRedeemCategories();
  const description = input.description?.trim() || `Resgate da meta ${goal.name}`;

  const { data: redeemTx, error: redeemError } = await supabase
    .from("transactions")
    .insert({
      user_id: user.id,
      type: "REDEEM",
      destination_account_id: input.accountId,
      goal_id: input.goalId,
      amount: input.amount,
      date: input.date,
      description,
      category_id: reason === "COMPLETED" ? completedId : earlyId,
    })
    .select("id")
    .single();
  if (redeemError) throw new Error(redeemError.message);

  const recognizedYield = subtractMoney(input.amount, Math.max(0, bookBalance));
  if (recognizedYield > 0) {
    const { error: yieldError } = await supabase.from("goal_yields").insert({
      user_id: user.id,
      goal_id: input.goalId,
      amount: recognizedYield,
      date: input.date,
      description: `Rendimento reconhecido no resgate — ${goal.name}`,
      origin_redeem_transaction_id: redeemTx.id,
    });
    if (yieldError) throw new Error(yieldError.message);
  }
}

/**
 * "Informar rendimento" — enter the goal's current real balance; the delta over the computed
 * book balance is logged as a `goal_yields` row (synthetic INCOME under "Rendimentos"). Only
 * positive deltas in v1 — a downward correction is done by editing the goal, not here.
 */
export async function registerGoalYield(input: GoalYieldInput): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();

  const bookBalance = await computeGoalBalance(supabase, input.goalId);
  const delta = subtractMoney(input.realBalance, bookBalance);
  if (delta <= 0) return;

  const { data: goal, error: goalError } = await supabase.from("goals").select("name").eq("id", input.goalId).single();
  if (goalError) throw new Error(goalError.message);

  const { error } = await supabase.from("goal_yields").insert({
    user_id: user.id,
    goal_id: input.goalId,
    amount: delta,
    date: input.date,
    description: `Rendimento da meta ${goal.name}`,
  });
  if (error) throw new Error(error.message);
}

/**
 * Edit a RESERVE/REDEEM ledger row (typo fix) — amount/date/account/description, propagated to
 * the same `transactions` row. The kind never changes. A recognized-yield `goal_yields` child of
 * an edited REDEEM is not recomputed — to change a redeem's amount meaningfully, delete and redo.
 */
export async function updateGoalEntry(input: UpdateGoalEntryInput): Promise<void> {
  const supabase = await createClient();

  const { data: existing, error: fetchError } = await supabase
    .from("transactions")
    .select("type")
    .eq("id", input.id)
    .single();
  if (fetchError) throw new Error(fetchError.message);
  if (existing.type !== "RESERVE" && existing.type !== "REDEEM") {
    throw new Error("Lançamento inválido para esta operação.");
  }

  const { data: account, error: accountError } = await supabase.from("accounts").select("type").eq("id", input.accountId).single();
  if (accountError) throw new Error(accountError.message);
  if (account.type === "CREDIT_CARD") {
    throw new Error("Aporte/resgate de meta usa uma conta em dinheiro ou banco, nunca um cartão.");
  }

  const patch: Record<string, unknown> = { amount: input.amount, date: input.date };
  if (input.description !== undefined) patch.description = input.description?.trim() || null;
  if (existing.type === "RESERVE") {
    patch.origin_account_id = input.accountId;
  } else {
    patch.destination_account_id = input.accountId;
  }

  const { error } = await supabase.from("transactions").update(patch).eq("id", input.id);
  if (error) throw new Error(error.message);
}

export async function updateGoalYield(input: UpdateGoalYieldInput): Promise<void> {
  const supabase = await createClient();
  const patch: Record<string, unknown> = { amount: input.amount, date: input.date };
  if (input.description !== undefined) patch.description = input.description?.trim() || null;
  const { error } = await supabase.from("goal_yields").update(patch).eq("id", input.id);
  if (error) throw new Error(error.message);
}

/**
 * Hard delete a RESERVE/REDEEM ledger row (a genuinely wrong entry). The account balance
 * recomputes; a recognized-yield `goal_yields` child of a deleted REDEEM cascades away
 * (origin_redeem_transaction_id ON DELETE CASCADE). Matches deleteReservoirTransaction /
 * deleteDebtTransaction.
 */
export async function deleteGoalEntry(id: string): Promise<void> {
  const supabase = await createClient();
  const { data: existing, error: fetchError } = await supabase.from("transactions").select("type").eq("id", id).single();
  if (fetchError) throw new Error(fetchError.message);
  if (existing.type !== "RESERVE" && existing.type !== "REDEEM") {
    throw new Error("Lançamento inválido para esta operação.");
  }
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteGoalYield(id: string): Promise<void> {
  const supabase = await createClient();
  const { data: existing, error: fetchError } = await supabase
    .from("goal_yields")
    .select("origin_redeem_transaction_id")
    .eq("id", id)
    .single();
  if (fetchError) throw new Error(fetchError.message);
  if (existing.origin_redeem_transaction_id) {
    throw new Error("Este rendimento foi reconhecido dentro de um resgate — exclua o resgate.");
  }
  const { error } = await supabase.from("goal_yields").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Σ current balance of every Meta still attached to a live goal (orphaned RESERVE/REDEEM rows
 * left by a deleted goal are excluded). Feeds FinancialSummaryDTO.reservedTotal — a global
 * figure, not scoped by the dashboard's account filter.
 */
export async function getReservedTotal(): Promise<number> {
  const supabase = await createClient();
  const user = await getUser();
  const [{ data: txs }, { data: yields }] = await Promise.all([
    supabase.from("transactions").select("amount, type").eq("user_id", user.id).in("type", ["RESERVE", "REDEEM"]).not("goal_id", "is", null),
    supabase.from("goal_yields").select("amount").eq("user_id", user.id),
  ]);
  const reserved = sumMoney((txs ?? []).filter((t) => t.type === "RESERVE").map((t) => t.amount));
  const redeemed = sumMoney((txs ?? []).filter((t) => t.type === "REDEEM").map((t) => t.amount));
  const yielded = sumMoney((yields ?? []).map((y) => y.amount));
  return Math.max(0, addMoney(subtractMoney(reserved, redeemed), yielded));
}

/**
 * Total held across all goals at the end of each of the last 13 months, plus the sum of every
 * goal's target — feeds the accumulation chart on /goals. Cumulative (a stock), unlike the
 * monthly-evolution "reserved" bar (a flow).
 */
export async function getGoalAccumulation(): Promise<GoalAccumulationDTO> {
  const supabase = await createClient();
  const user = await getUser();

  const { data: goalRows, error } = await supabase.from("goals").select("id, goal_target").eq("user_id", user.id);
  if (error) throw new Error(error.message);
  if (!goalRows?.length) return { points: [], targetTotal: 0 };

  const goalIds = goalRows.map((g) => g.id);
  const targetTotal = sumMoney(goalRows.map((g) => g.goal_target));

  const [{ data: txRows }, { data: yieldRows }] = await Promise.all([
    supabase.from("transactions").select("amount, type, date").in("goal_id", goalIds).in("type", ["RESERVE", "REDEEM"]),
    supabase.from("goal_yields").select("amount, date").in("goal_id", goalIds),
  ]);

  const currentMonth = monthKey(todayIso());
  const points = Array.from({ length: 13 }, (_, i) => {
    const m = monthKey(addMonthsToIsoDate(`${currentMonth}-01`, i - 12));
    const cutoff = endOfMonth(`${m}-01`);
    const reserved = sumMoney((txRows ?? []).filter((t) => t.type === "RESERVE" && t.date <= cutoff).map((t) => t.amount));
    const redeemed = sumMoney((txRows ?? []).filter((t) => t.type === "REDEEM" && t.date <= cutoff).map((t) => t.amount));
    const yielded = sumMoney((yieldRows ?? []).filter((y) => y.date <= cutoff).map((y) => y.amount));
    return { month: formatMonthLabel(m, true), total: Math.max(0, addMoney(subtractMoney(reserved, redeemed), yielded)) };
  });

  return { points, targetTotal };
}

/** Compact per-goal figures for the dashboard "Metas" block. */
export async function getGoalsOverview(): Promise<GoalsOverviewDTO> {
  const goals = await getGoals();
  return {
    goals: goals.map((g) => ({
      id: g.id,
      name: g.name,
      goalTarget: g.goalTarget,
      currentBalance: g.currentBalance,
      progressPercent: g.progressPercent,
      status: g.status,
      scheduleOffsetMonths: g.scheduleOffsetMonths,
    })),
  };
}
