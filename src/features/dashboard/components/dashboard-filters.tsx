"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import type { AccountDTO, CategoryDTO } from "@/types/dto";
import { monthKey, todayIso, type DashboardPeriodPreset } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";
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

const PRESETS: { value: DashboardPeriodPreset; label: string }[] = [
  { value: "month", label: "Mês" },
  { value: "last3", label: "3 meses" },
  { value: "last6", label: "6 meses" },
  { value: "last12", label: "12 meses" },
  { value: "year", label: "Ano" },
  { value: "custom", label: "Personalizado" },
];

export function DashboardFilters({
  preset,
  accounts,
  categories,
}: {
  preset: DashboardPeriodPreset;
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
  const activeType = searchParams.get("type") ?? "";
  const customStart = searchParams.get("periodStart") ?? "";
  const customEnd = searchParams.get("periodEnd") ?? "";
  const currentMonth = searchParams.get("month") ?? monthKey(todayIso());

  function setCustomRange(nextStart: string, nextEnd: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", "custom");
    if (nextStart) params.set("periodStart", nextStart);
    if (nextEnd) params.set("periodEnd", nextEnd);
    navigate(`${pathname}?${params.toString()}`);
  }

  function setMonth(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", "month");
    params.set("month", value);
    navigate(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Month-by-month browser — quicker than the preset buttons for paging through history
          (or upcoming card installments already scheduled) one month at a time. */}
      <MonthPicker month={currentMonth} onChange={setMonth} />

      {/* overflow-x-auto (not overflow-hidden) so this row scrolls instead of clipping presets
          off the edge on narrow screens — a plain overflow-hidden here left "Personalizado"
          entirely unreachable on mobile (its content width exceeds the viewport, and no
          ancestor offered horizontal scroll to reach it). min-w-0 is load-bearing: without it, a
          flex item that scrolls internally still refuses to shrink below its content's width,
          which just pushed the overflow (and the clipping) up to this row's own flex parent
          instead of fixing it. shrink-0 on each button keeps them full size instead of being
          squeezed to fit. */}
      <div className="flex w-0 min-w-0 flex-1 overflow-x-auto border border-divider sm:w-auto sm:flex-none">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => setParam("period", p.value)}
            className={cn(
              "shrink-0 whitespace-nowrap border-l border-divider px-3 py-1.5 text-[13px] first:border-l-0",
              preset === p.value ? "bg-accent text-bg" : "hover:bg-text/[0.06]"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {preset === "custom" && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            defaultValue={customStart}
            onChange={(e) => setCustomRange(e.target.value, customEnd)}
            className="h-9 border border-divider bg-surface px-2 text-[13px]"
          />
          <span className="text-xs opacity-50">até</span>
          <input
            type="date"
            defaultValue={customEnd}
            onChange={(e) => setCustomRange(customStart, e.target.value)}
            className="h-9 border border-divider bg-surface px-2 text-[13px]"
          />
        </div>
      )}

      <Select value={activeType || "ALL"} onValueChange={(v) => setParam("type", v === "ALL" ? null : v)}>
        <SelectTrigger className="w-36"><SelectValue placeholder="Tipo" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">Receita e despesa</SelectItem>
          <SelectItem value="INCOME">Receitas</SelectItem>
          <SelectItem value="EXPENSE">Despesas</SelectItem>
        </SelectContent>
      </Select>

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

      {(activeAccount || activeCategoryIds.length > 0 || activeType) && (
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
