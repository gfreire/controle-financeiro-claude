"use client";

import { useState } from "react";
import type { CategoryDTO } from "@/types/dto";

/**
 * Onboarding/import tree row: category checkbox + nested subcategory checkboxes.
 * Unchecking the category hides (and excludes from submission) all its subcategories;
 * individual subcategories can be deselected while keeping the rest of the category —
 * e.g. keep "Moradia" but only "Aluguel", skip "IPTU".
 */
export function CategoryTreeItem({ category, initialChecked }: { category: CategoryDTO; initialChecked: boolean }) {
  const [categoryChecked, setCategoryChecked] = useState(initialChecked);
  const [subChecked, setSubChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(category.subcategories.map((s) => [s.id, initialChecked]))
  );

  function toggleCategory(value: boolean) {
    setCategoryChecked(value);
    if (value) {
      // Re-checking the category restores all its subcategories rather than staying empty.
      setSubChecked(Object.fromEntries(category.subcategories.map((s) => [s.id, true])));
    }
  }

  return (
    <div className="border border-divider">
      <label className="flex cursor-pointer items-center gap-2 px-2.5 py-2 text-sm font-medium hover:bg-text/[0.04]">
        <input
          type="checkbox"
          name="categoryId"
          value={category.id}
          checked={categoryChecked}
          onChange={(e) => toggleCategory(e.target.checked)}
          className="accent-[var(--color-accent)]"
        />
        <span>{category.icon}</span>
        {category.name}
      </label>

      {categoryChecked && category.subcategories.length > 0 && (
        <div className="flex flex-col gap-0.5 border-t border-divider bg-text/[0.02] py-1 pl-7">
          {category.subcategories.map((sub) => (
            <label key={sub.id} className="flex cursor-pointer items-center gap-2 px-2 py-1 text-[13px] hover:bg-text/[0.04]">
              <input
                type="checkbox"
                name="subcategoryId"
                value={sub.id}
                checked={subChecked[sub.id] ?? true}
                onChange={(e) => setSubChecked((prev) => ({ ...prev, [sub.id]: e.target.checked }))}
                className="accent-[var(--color-accent)]"
              />
              {sub.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
