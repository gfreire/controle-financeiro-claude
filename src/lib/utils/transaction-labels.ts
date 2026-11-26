import type { TransactionViewDTO } from "@/types/dto";

/**
 * Text shown for a transaction/installment row: its own description, else the subcategory name,
 * else the category name (same fallback the Cards page invoice list uses). Display only — the
 * stored description stays empty.
 */
export function displayDescription(t: Pick<TransactionViewDTO, "description" | "subcategory" | "category">): string {
  return t.description || t.subcategory || t.category || "";
}

/** "cartão" for a 1x card purchase; "cartão · parcela 3/8" for one installment of a parcelled purchase. */
export function installmentBadgeLabel(t: Pick<TransactionViewDTO, "installmentNumber" | "totalInstallments">): string {
  return t.installmentNumber && t.totalInstallments ? `cartão · parcela ${t.installmentNumber}/${t.totalInstallments}` : "cartão";
}
