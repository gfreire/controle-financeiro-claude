"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CategorySelect, SubcategorySelect } from "@/features/categories/components/category-select";
import { inlineEditTransaction } from "../actions";
import type { CategoryDTO, TransactionViewDTO } from "@/types/dto";

const UNCATEGORIZED = "UNCATEGORIZED";

// Narrow subset of TransactionViewDTO — lets non-dashboard callers (e.g. the Cards page, editing
// a card_purchases row directly) reuse this without fabricating unrelated DTO fields like date/account.
type EditableCategoryRow = Pick<TransactionViewDTO, "id" | "source" | "type" | "categoryId" | "subcategoryId" | "purchaseId">;

export function EditableCategoryCell({
  row,
  categories: initialCategories,
  layout = "stack",
}: {
  row: EditableCategoryRow;
  categories: CategoryDTO[];
  /** "row" places category/subcategory side by side (2-col grid) instead of stacked — used by the Cards page's mobile-only line 2. */
  layout?: "stack" | "row";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [categories, setCategories] = useState(initialCategories);
  const [categoryId, setCategoryId] = useState(row.categoryId ?? UNCATEGORIZED);
  const [subcategoryId, setSubcategoryId] = useState(row.subcategoryId ?? UNCATEGORIZED);

  // Transfers and credit-card-payment account-side movements never carry a category
  // (see AI_CONTEXT.md "Money Reality Rules") — nothing to edit for these rows.
  if (row.type === "CREDIT_CARD_PAYMENT") {
    return <span className="text-xs opacity-70">Pagamento de Cartão</span>;
  }
  if (row.type === "TRANSFER") {
    return <span className="text-xs opacity-40">—</span>;
  }

  const relevantCategories = categories.filter((c) => c.type === row.type);
  const selectedCategory = relevantCategories.find((c) => c.id === categoryId);
  const subcategories = selectedCategory?.subcategories ?? [];

  function commit(nextCategoryId: string, nextSubcategoryId: string) {
    startTransition(async () => {
      await inlineEditTransaction({
        id: row.id,
        source: row.source,
        purchaseId: row.purchaseId,
        categoryId: nextCategoryId === UNCATEGORIZED ? null : nextCategoryId,
        subcategoryId: nextSubcategoryId === UNCATEGORIZED ? null : nextSubcategoryId,
      });
      router.refresh();
    });
  }

  return (
    <div className={layout === "row" ? "grid grid-cols-2 gap-1" : "flex flex-col gap-1 min-w-[9rem]"}>
      <CategorySelect
        categories={categories}
        type={row.type}
        value={categoryId}
        disabled={pending}
        triggerClassName="h-7 text-xs"
        placeholder="Sem categoria"
        noneValue={UNCATEGORIZED}
        noneLabel="Sem categoria"
        onChange={(value) => {
          setCategoryId(value);
          setSubcategoryId(UNCATEGORIZED);
          commit(value, UNCATEGORIZED);
        }}
        onCategoryCreated={(created) => setCategories((prev) => [...prev, created])}
      />
      {selectedCategory && row.type === "EXPENSE" && (
        <SubcategorySelect
          subcategories={subcategories}
          categoryId={selectedCategory.id}
          value={subcategoryId}
          disabled={pending}
          triggerClassName="h-7 text-xs"
          placeholder="Subcategoria"
          noneValue={UNCATEGORIZED}
          noneLabel="Sem subcategoria"
          onChange={(value) => {
            setSubcategoryId(value);
            commit(categoryId, value);
          }}
          onSubcategoryCreated={(created) =>
            setCategories((prev) => prev.map((c) => (c.id === selectedCategory.id ? { ...c, subcategories: [...c.subcategories, created] } : c)))
          }
        />
      )}
    </div>
  );
}
