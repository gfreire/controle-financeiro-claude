"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import type { AccountDTO, CategoryDTO } from "@/types/dto";
import { monthKey, todayIso, type DashboardPeriodPreset } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MonthPicker } from "@/components/ui/month-picker";
import { AccountTypeIcon } from "@/components/ui/account-type-icon";

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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams]
  );

  const activeAccount = searchParams.get("accounts") ?? "";
  const activeCategory = searchParams.get("categories") ?? "";
  const activeType = searchParams.get("type") ?? "";
  const customStart = searchParams.get("periodStart") ?? "";
  const customEnd = searchParams.get("periodEnd") ?? "";
  const currentMonth = searchParams.get("month") ?? monthKey(todayIso());

  function setCustomRange(nextStart: string, nextEnd: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", "custom");
    if (nextStart) params.set("periodStart", nextStart);
    if (nextEnd) params.set("periodEnd", nextEnd);
    router.push(`${pathname}?${params.toString()}`);
  }

  function setMonth(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", "month");
    params.set("month", value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Month-by-month browser — quicker than the preset buttons for paging through history
          (or upcoming card installments already scheduled) one month at a time. */}
      <MonthPicker month={currentMonth} onChange={setMonth} />

      <div className="inline-flex overflow-hidden border border-divider">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => setParam("period", p.value)}
            className={cn(
              "border-l border-divider px-3 py-1.5 text-[13px] first:border-l-0",
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

      <Select value={activeCategory || "ALL"} onValueChange={(v) => setParam("categories", v === "ALL" ? null : v)}>
        <SelectTrigger className="w-44"><SelectValue placeholder="Categoria" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">Todas as categorias</SelectItem>
          <SelectGroup>
            <SelectLabel>Receitas</SelectLabel>
            {categories.filter((c) => c.type === "INCOME").map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>
            ))}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>Despesas</SelectLabel>
            {categories.filter((c) => c.type === "EXPENSE").map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      {(activeAccount || activeCategory || activeType) && (
        <button
          onClick={() => {
            const params = new URLSearchParams(searchParams.toString());
            params.delete("accounts");
            params.delete("categories");
            params.delete("subcategories");
            params.delete("type");
            router.push(`${pathname}?${params.toString()}`);
          }}
          className="p-1.5 -m-1.5 text-xs text-accent hover:underline"
        >
          Limpar filtros
        </button>
      )}
    </div>
  );
}
