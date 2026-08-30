"use server";

import { revalidatePath } from "next/cache";
import * as goalsService from "@/services/goals.service";
import {
  goalSchema,
  updateGoalSchema,
  goalReserveSchema,
  goalRedeemSchema,
  goalYieldSchema,
  updateGoalEntrySchema,
  updateGoalYieldSchema,
  type GoalInput,
  type UpdateGoalInput,
  type GoalReserveInput,
  type GoalRedeemInput,
  type GoalYieldInput,
  type UpdateGoalEntryInput,
  type UpdateGoalYieldInput,
} from "@/lib/validations/goals";

/** A goal mutation can move an account balance and change the dashboard's "guardado" figure /
 * income (yield) / reserved bar, so /dashboard, /accounts and /transactions all revalidate too. */
function revalidateGoalPaths() {
  revalidatePath("/goals");
  revalidatePath("/dashboard");
  revalidatePath("/accounts");
  revalidatePath("/transactions");
}

export async function createGoalAction(input: GoalInput) {
  const parsed = goalSchema.parse(input);
  await goalsService.createGoal(parsed);
  revalidateGoalPaths();
}

export async function updateGoalAction(input: UpdateGoalInput) {
  const { id, ...rest } = updateGoalSchema.parse(input);
  await goalsService.updateGoal(id, rest);
  revalidateGoalPaths();
}

export async function deleteGoalAction(id: string) {
  await goalsService.deleteGoal(id);
  revalidateGoalPaths();
}

export async function addReserveAction(input: GoalReserveInput) {
  const parsed = goalReserveSchema.parse(input);
  await goalsService.addReserve(parsed);
  revalidateGoalPaths();
}

export async function redeemGoalAction(input: GoalRedeemInput) {
  const parsed = goalRedeemSchema.parse(input);
  await goalsService.redeemGoal(parsed);
  revalidateGoalPaths();
}

export async function registerGoalYieldAction(input: GoalYieldInput) {
  const parsed = goalYieldSchema.parse(input);
  await goalsService.registerGoalYield(parsed);
  revalidateGoalPaths();
}

export async function updateGoalEntryAction(input: UpdateGoalEntryInput) {
  const parsed = updateGoalEntrySchema.parse(input);
  await goalsService.updateGoalEntry(parsed);
  revalidateGoalPaths();
}

export async function updateGoalYieldAction(input: UpdateGoalYieldInput) {
  const parsed = updateGoalYieldSchema.parse(input);
  await goalsService.updateGoalYield(parsed);
  revalidateGoalPaths();
}

export async function deleteGoalEntryAction(id: string) {
  await goalsService.deleteGoalEntry(id);
  revalidateGoalPaths();
}

export async function deleteGoalYieldAction(id: string) {
  await goalsService.deleteGoalYield(id);
  revalidateGoalPaths();
}
