"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useState, useEffect } from "react";
import type { AccountDTO, CategoryDTO } from "@/types/dto";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useNavigationProgress } from "@/components/providers/navigation-progress";

export function CardFilters({ cards, categories }: { cards: AccountDTO[]; categories: CategoryDTO[] }) {
  const { navigate } = useNavigationProgress();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
      if (key === "categoryId") params.delete("subcategoryId");
      navigate(`${pathname}?${params.toString()}`);
    },
    [pathname, navigate, searchParams]
  );

  const activeCard = searchParams.get("cardId") ?? "";
  const activeCategory = searchParams.get("categoryId") ?? "";
  const activeSubcategory = searchParams.get("subcategoryId") ?? "";
  const selectedCategory = categories.find((c) => c.id === activeCategory);

  const [q, setQ] = useState(searchParams.get("q") ?? "");
  useEffect(() => setQ(searchParams.get("q") ?? ""), [searchParams]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (q !== (searchParams.get("q") ?? "")) setParam("q", q || null);
    }, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={activeCard || "ALL"} onValueChange={(v) => setParam("cardId", v === "ALL" ? null : v)}>
        <SelectTrigger className="w-40"><SelectValue placeholder="Cartão" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">Todos os cartões</SelectItem>
          {cards.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={activeCategory || "ALL"} onValueChange={(v) => setParam("categoryId", v === "ALL" ? null : v)}>
        <SelectTrigger className="w-44"><SelectValue placeholder="Categoria" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">Todas as categorias</SelectItem>
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

      <Input placeholder="Buscar..." value={q} onChange={(e) => setQ(e.target.value)} className="h-9 w-40" />

      {(activeCard || activeCategory || activeSubcategory || q) && (
        <button
          onClick={() => {
            const params = new URLSearchParams(searchParams.toString());
            params.delete("cardId");
            params.delete("categoryId");
            params.delete("subcategoryId");
            params.delete("q");
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
