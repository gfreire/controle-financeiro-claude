"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inlineEditTransaction } from "../actions";
import type { CategoryDTO, TransactionViewDTO } from "@/types/dto";

const UNCATEGORIZED = "UNCATEGORIZED";

export function EditableCategoryCell({ row, categories }: { row: TransactionViewDTO; categories: CategoryDTO[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [categoryId, setCategoryId] = useState(row.categoryId ?? UNCATEGORIZED);
  const [subcategoryId, setSubcategoryId] = useState(row.subcategoryId ?? UNCATEGORIZED);

  // Transfers and credit-card-payment account-side movements never carry a category
  // (see AI_CONTEXT.md "Money Reality Rules") — nothing to edit for these rows.
  if (row.type === "TRANSFER" || row.type === "CREDIT_CARD_PAYMENT") {
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
        categoryId: nextCategoryId === UNCATEGORIZED ? null : nextCategoryId,
        subcategoryId: nextSubcategoryId === UNCATEGORIZED ? null : nextSubcategoryId,
      });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1 min-w-[9rem]">
      <Select
        value={categoryId}
        disabled={pending}
        onValueChange={(value) => {
          setCategoryId(value);
          setSubcategoryId(UNCATEGORIZED);
          commit(value, UNCATEGORIZED);
        }}
      >
        <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Sem categoria" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={UNCATEGORIZED}>Sem categoria</SelectItem>
          {relevantCategories.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selectedCategory && subcategories.length > 0 && row.type === "EXPENSE" && (
        <Select
          value={subcategoryId}
          disabled={pending}
          onValueChange={(value) => {
            setSubcategoryId(value);
            commit(categoryId, value);
          }}
        >
          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Subcategoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={UNCATEGORIZED}>Sem subcategoria</SelectItem>
            {subcategories.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
