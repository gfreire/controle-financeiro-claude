"use server";

import { revalidatePath } from "next/cache";
import * as reservoirsService from "@/services/reservoirs.service";
import {
  reservoirSchema,
  reservoirAccrualSchema,
  reservoirWithdrawalSchema,
  type ReservoirInput,
  type ReservoirAccrualInput,
  type ReservoirWithdrawalInput,
} from "@/lib/validations/reservoirs";

export async function createReservoirAction(input: ReservoirInput) {
  const parsed = reservoirSchema.parse(input);
  await reservoirsService.createReservoir(parsed);
  revalidatePath("/reservoirs");
}

export async function addReservoirAccrualAction(input: ReservoirAccrualInput) {
  const parsed = reservoirAccrualSchema.parse(input);
  await reservoirsService.addReservoirTransaction(parsed);
  revalidatePath("/reservoirs");
}

export async function withdrawReservoirAction(input: ReservoirWithdrawalInput) {
  const parsed = reservoirWithdrawalSchema.parse(input);
  await reservoirsService.withdrawReservoir(parsed);
  revalidatePath("/reservoirs");
  revalidatePath("/dashboard");
  revalidatePath("/accounts");
}
