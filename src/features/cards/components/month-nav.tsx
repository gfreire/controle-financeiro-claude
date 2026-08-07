"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addMonthsToIsoDate, formatMonthLabel, monthKey, todayIso } from "@/lib/utils/date";

export function MonthNav() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentMonth = searchParams.get("month") ?? monthKey(todayIso());
  const isCurrentMonth = currentMonth === monthKey(todayIso());

  function navigate(delta: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", monthKey(addMonthsToIsoDate(`${currentMonth}-01`, delta)));
    router.push(`${pathname}?${params.toString()}`);
  }

  function jumpTo(value: string) {
    if (!value) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", value);
    router.push(`${pathname}?${params.toString()}`);
  }

  function goToday() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", monthKey(todayIso()));
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center border border-divider">
        <button onClick={() => navigate(-1)} className="p-1.5 hover:bg-text/[0.06]" aria-label="Mês anterior">
          <ChevronLeft className="size-4" strokeWidth={1.5} />
        </button>
        <span className="relative flex min-w-[9rem] cursor-pointer items-center justify-center px-1 text-center text-[13px] font-medium capitalize hover:bg-text/[0.06]">
          {formatMonthLabel(currentMonth)}
          <input
            type="month"
            value={currentMonth}
            onChange={(e) => jumpTo(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label="Escolher mês"
            title="Escolher mês"
          />
        </span>
        <button onClick={() => navigate(1)} className="p-1.5 hover:bg-text/[0.06]" aria-label="Próximo mês">
          <ChevronRight className="size-4" strokeWidth={1.5} />
        </button>
      </div>
      {!isCurrentMonth && (
        <button onClick={goToday} className="text-xs text-accent hover:underline">
          Hoje
        </button>
      )}
    </div>
  );
}
