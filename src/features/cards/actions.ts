"use server";

import { revalidatePath } from "next/cache";
import * as cardsService from "@/services/cards.service";
import { cardPurchaseSchema, updateCardPurchaseSchema, cardPaymentSchema, refundCardPurchaseSchema, advancePurchaseInstallmentsSchema, type CardPurchaseInput, type CardPaymentInput } from "@/lib/validations/cards";

export async function createCardPurchaseAction(input: CardPurchaseInput) {
  const parsed = cardPurchaseSchema.parse(input);
  await cardsService.createCardPurchase(parsed);
  revalidatePath("/cards");
  revalidatePath("/dashboard");
}

export async function updateCardPurchaseAction(id: string, input: Partial<CardPurchaseInput>) {
  const parsed = updateCardPurchaseSchema.parse({ id, ...input });
  await cardsService.updateCardPurchase(id, parsed);
  revalidatePath("/cards");
  revalidatePath("/dashboard");
}

export async function deleteCardPurchaseAction(id: string) {
  await cardsService.deleteCardPurchase(id);
  revalidatePath("/cards");
  revalidatePath("/dashboard");
}

export async function registerCardPaymentAction(input: CardPaymentInput) {
  const parsed = cardPaymentSchema.parse(input);
  await cardsService.registerCardPayment(parsed);
  revalidatePath("/cards");
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
}

export async function refundCardPurchaseAction(input: { purchaseId: string; refundDate: string }) {
  const parsed = refundCardPurchaseSchema.parse(input);
  await cardsService.refundCardPurchase(parsed.purchaseId, parsed.refundDate);
  revalidatePath("/cards");
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
}

export async function advancePurchaseInstallmentsAction(input: { purchaseId: string; count: number }) {
  const parsed = advancePurchaseInstallmentsSchema.parse(input);
  await cardsService.advancePurchaseInstallments(parsed.purchaseId, parsed.count);
  revalidatePath("/cards");
  revalidatePath("/dashboard");
}
