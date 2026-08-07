"use server";

import { revalidatePath } from "next/cache";
import * as cardsService from "@/services/cards.service";
import { cardPurchaseSchema, cardPaymentSchema, type CardPurchaseInput, type CardPaymentInput } from "@/lib/validations/cards";

export async function createCardPurchaseAction(input: CardPurchaseInput) {
  const parsed = cardPurchaseSchema.parse(input);
  await cardsService.createCardPurchase(parsed);
  revalidatePath("/cards");
  revalidatePath("/dashboard");
}

export async function updateCardPurchaseAction(id: string, input: Partial<CardPurchaseInput>) {
  await cardsService.updateCardPurchase(id, input);
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
