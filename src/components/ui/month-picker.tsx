"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addMonthsToIsoDate, formatMonthLabel, monthKey, todayIso } from "@/lib/utils/date";

/**
 * Shared month browser: prev/next arrows + a label that also opens the native
 * month picker. The overlaid <input type="month"> only reacts to clicks on the
 * browser's own calendar-icon hit area (not the full field), which usually lands
 * near the right edge — clicking the label text itself did nothing. Triggering
 * showPicker() from the wrapper's onClick makes the whole label clickable.
 */
export function MonthPicker({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isCurrentMonth = month === monthKey(todayIso());

  function openPicker() {
    const input = inputRef.current;
    if (!input) return;
    if (typeof input.showPicker === "function") input.showPicker();
    else input.focus();
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center border border-divider">
        <button
          onClick={() => onChange(monthKey(addMonthsToIsoDate(`${month}-01`, -1)))}
          className="p-1.5 hover:bg-text/[0.06]"
          aria-label="Mês anterior"
        >
          <ChevronLeft className="size-4" strokeWidth={1.5} />
        </button>
        <span
          onClick={openPicker}
          className="relative flex min-w-[9rem] cursor-pointer items-center justify-center px-1 text-center text-[13px] font-medium capitalize hover:bg-text/[0.06]"
        >
          {formatMonthLabel(month)}
          <input
            ref={inputRef}
            type="month"
            value={month}
            onChange={(e) => e.target.value && onChange(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label="Escolher mês"
            title="Escolher mês"
          />
        </span>
        <button
          onClick={() => onChange(monthKey(addMonthsToIsoDate(`${month}-01`, 1)))}
          className="p-1.5 hover:bg-text/[0.06]"
          aria-label="Próximo mês"
        >
          <ChevronRight className="size-4" strokeWidth={1.5} />
        </button>
      </div>
      {!isCurrentMonth && (
        <button onClick={() => onChange(monthKey(todayIso()))} className="p-1.5 -m-1.5 text-xs text-accent hover:underline">
          Hoje
        </button>
      )}
    </div>
  );
}
