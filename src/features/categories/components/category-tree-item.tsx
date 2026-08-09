"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { CategoryImportOptionDTO } from "@/types/dto";

/**
 * Onboarding/import tree row: category checkbox + nested subcategory checkboxes.
 * Unchecking the category hides (and excludes from submission) all its subcategories;
 * individual subcategories can be deselected while keeping the rest of the category —
 * e.g. keep "Moradia" but only "Aluguel", skip "IPTU".
 *
 * Always shows the full default catalog now, not just what's missing (see AI_CONTEXT.md
 * "Onboarding"). A category/subcategory the user already imported renders checked+disabled —
 * visible so the whole starter pack reads as one list, but not deselectable since it already
 * exists. Disabled checkboxes never submit, so already-imported items simply don't reach the
 * server action; only genuinely new selections do.
 */
export function CategoryTreeItem({ category, initialChecked }: { category: CategoryImportOptionDTO; initialChecked: boolean }) {
  const [categoryChecked, setCategoryChecked] = useState(category.alreadyImported || initialChecked);
  const [subChecked, setSubChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(category.subcategories.map((s) => [s.id, s.alreadyImported || initialChecked]))
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
      <label
        className={`flex items-center gap-2 px-2.5 py-2 text-sm font-medium ${
          category.alreadyImported ? "opacity-60" : "cursor-pointer hover:bg-text/[0.04]"
        }`}
      >
        <input
          type="checkbox"
          name="categoryId"
          value={category.id}
          checked={categoryChecked}
          disabled={category.alreadyImported}
          onChange={(e) => toggleCategory(e.target.checked)}
          className="accent-[var(--color-accent)]"
        />
        <span>{category.icon}</span>
        <span className="flex-1">{category.name}</span>
        {category.alreadyImported && <Badge variant="neutral">Já importada</Badge>}
      </label>

      {categoryChecked && category.subcategories.length > 0 && (
        <div className="flex flex-col gap-0.5 border-t border-divider bg-text/[0.02] py-1 pl-7">
          {category.subcategories.map((sub) => (
            <label
              key={sub.id}
              className={`flex items-center gap-2 px-2 py-1 text-[13px] ${
                sub.alreadyImported ? "opacity-60" : "cursor-pointer hover:bg-text/[0.04]"
              }`}
            >
              <input
                type="checkbox"
                name="subcategoryId"
                value={sub.id}
                checked={subChecked[sub.id] ?? true}
                disabled={sub.alreadyImported}
                onChange={(e) => setSubChecked((prev) => ({ ...prev, [sub.id]: e.target.checked }))}
                className="accent-[var(--color-accent)]"
              />
              <span className="flex-1">{sub.name}</span>
              {sub.alreadyImported && <Badge variant="neutral">Já importada</Badge>}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
