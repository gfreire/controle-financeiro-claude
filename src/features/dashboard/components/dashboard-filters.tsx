"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import type { AccountDTO, CategoryDTO } from "@/types/dto";
import { monthKey, todayIso } from "@/lib/utils/date";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MonthPicker } from "@/components/ui/month-picker";
import { AccountTypeIcon } from "@/components/ui/account-type-icon";
import { useNavigationProgress } from "@/components/providers/navigation-progress";
import { CategoryMultiSelect } from "@/features/dashboard/components/category-multi-select";

/**
 * Single-month dashboard controls: a month browser plus category/account/type filters. The
 * period presets (Mês / 3 meses / … / Personalizado) were removed 2026-08-28 — the user found
 * them heavy for this screen and plans a separate reports tab for multi-period analysis.
 */
export function DashboardFilters({
  month,
  accounts,
  categories,
}: {
  /** Server-resolved viewed month — the Dashboard may auto-advance to next month when every
   *  current-month expense is paid; fall back to it when the URL has no explicit `?month=`. */
  month?: string;
  accounts: AccountDTO[];
  categories: CategoryDTO[];
}) {
  const { navigate } = useNavigationProgress();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
      navigate(`${pathname}?${params.toString()}`);
    },
    [pathname, navigate, searchParams]
  );

  const activeAccount = searchParams.get("accounts") ?? "";
  const activeCategoryIds = (searchParams.get("categories") ?? "").split(",").filter(Boolean);
  const currentMonth = searchParams.get("month") ?? month ?? monthKey(todayIso());

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Month-by-month browser — the only period control on the dashboard now. */}
      <MonthPicker month={currentMonth} onChange={(value) => setParam("month", value)} />

      {/* "Tipo" (Receitas/Despesas) was folded into the category filter's group checkboxes
          on 2026-08-28 — selecting a whole "Receitas"/"Despesas" group is the new "só receitas"
          / "só despesas". */}

      <Select value={activeAccount || "ALL"} onValueChange={(v) => setParam("accounts", v === "ALL" ? null : v)}>
        <SelectTrigger className="w-40"><SelectValue placeholder="Conta" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">Todas as contas</SelectItem>
          {accounts.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              <span className="inline-flex items-center gap-1.5">
                <AccountTypeIcon type={a.type} className="size-3.5 opacity-70" />
                {a.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <CategoryMultiSelect categories={categories} />

      {(activeAccount || activeCategoryIds.length > 0) && (
        <button
          onClick={() => {
            const params = new URLSearchParams(searchParams.toString());
            params.delete("accounts");
            params.delete("categories");
            params.delete("subcategories");
            params.delete("type");
            navigate(`${pathname}?${params.toString()}`);
          }}
          className="p-1.5 -m-1.5 text-xs text-accent hover:underline"
        >
          Limpar filtros
        </button>
      )}
    </div>
  );
}
