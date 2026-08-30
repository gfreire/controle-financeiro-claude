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

  // This cell has no open/close cycle — it's always rendered — so unlike a dialog it can't just
  // reset on open. It must instead track the row's own category directly, via React's documented
  // render-phase "adjusting state when a prop changes" pattern (not an Effect — an Effect would
  // run one render late, and setState inside it is flagged by react-hooks/set-state-in-effect
  // anyway). Without this, the same list re-rendering with fresh data after an edit elsewhere
  // (e.g. the row's full-edit pencil dialog) would leave this cell showing whatever category was
  // current when it first mounted.
  const [prevRowCategoryId, setPrevRowCategoryId] = useState(row.categoryId ?? null);
  const [prevRowSubcategoryId, setPrevRowSubcategoryId] = useState(row.subcategoryId ?? null);
  if (row.categoryId !== prevRowCategoryId || row.subcategoryId !== prevRowSubcategoryId) {
    setPrevRowCategoryId(row.categoryId ?? null);
    setPrevRowSubcategoryId(row.subcategoryId ?? null);
    setCategoryId(row.categoryId ?? UNCATEGORIZED);
    setSubcategoryId(row.subcategoryId ?? UNCATEGORIZED);
  }

  // Transfers and credit-card-payment account-side movements never carry a category
  // (see AI_CONTEXT.md "Money Reality Rules") — nothing to edit for these rows.
  if (row.type === "CREDIT_CARD_PAYMENT") {
    return <span className="text-xs opacity-70">Pagamento de Cartão</span>;
  }
  if (row.type === "TRANSFER") {
    return <span className="text-xs opacity-40">—</span>;
  }
  // Aporte/resgate de Meta — geridos pela tela de Metas, sem categoria editável aqui. Um REDEEM
  // carrega a categoria system "Resgate de Meta ..." (o bloco is_system abaixo também cobriria),
  // um RESERVE não carrega nenhuma.
  if (row.type === "RESERVE") {
    return <span className="text-xs opacity-70">Aporte para meta</span>;
  }
  if (row.type === "REDEEM") {
    return <span className="text-xs opacity-70">Resgate de meta</span>;
  }

  // A row already tagged with an is_system category (e.g. an installment of a refunded purchase,
  // now "Estorno") is never hand-editable — those categories are applied only by their own system
  // flow and don't appear in CategorySelect. Show the name as plain text, like TRANSFER above.
  const currentCategory = categories.find((c) => c.id === row.categoryId);
  if (currentCategory?.isSystem) {
    return <span className="text-xs opacity-70">{currentCategory.icon} {currentCategory.name}</span>;
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
