"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import type { AccountDTO, CategoryDTO } from "@/types/dto";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AccountTypeIcon } from "@/components/ui/account-type-icon";

export function TransactionFilters({ accounts, categories }: { accounts: AccountDTO[]; categories: CategoryDTO[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
      if (key === "categoryId") params.delete("subcategoryId");
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams]
  );

  const activeType = searchParams.get("type") ?? "";
  const activeAccount = searchParams.get("accountId") ?? "";
  const activeCategory = searchParams.get("categoryId") ?? "";
  const activeSubcategory = searchParams.get("subcategoryId") ?? "";
  const selectedCategory = categories.find((c) => c.id === activeCategory);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={activeAccount || "ALL"} onValueChange={(v) => setParam("accountId", v === "ALL" ? null : v)}>
        <SelectTrigger className="w-44"><SelectValue placeholder="Conta" /></SelectTrigger>
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

      <Select value={activeType || "ALL"} onValueChange={(v) => setParam("type", v === "ALL" ? null : v)}>
        <SelectTrigger className="w-36"><SelectValue placeholder="Tipo" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">Todos os tipos</SelectItem>
          <SelectItem value="INCOME">Receitas</SelectItem>
          <SelectItem value="EXPENSE">Despesas</SelectItem>
          <SelectItem value="TRANSFER">Transferências</SelectItem>
          <SelectItem value="CREDIT_CARD_PAYMENT">Pagamento de Cartão</SelectItem>
        </SelectContent>
      </Select>

      <Select value={activeCategory || "ALL"} onValueChange={(v) => setParam("categoryId", v === "ALL" ? null : v)}>
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

      {selectedCategory && selectedCategory.subcategories.length > 0 && (
        <Select value={activeSubcategory || "ALL"} onValueChange={(v) => setParam("subcategoryId", v === "ALL" ? null : v)}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Subcategoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todas as subcategorias</SelectItem>
            {selectedCategory.subcategories.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {(activeType || activeAccount || activeCategory || activeSubcategory) && (
        <button
          onClick={() => {
            const params = new URLSearchParams(searchParams.toString());
            params.delete("type");
            params.delete("accountId");
            params.delete("categoryId");
            params.delete("subcategoryId");
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
