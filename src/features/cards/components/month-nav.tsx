"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { monthKey, todayIso } from "@/lib/utils/date";
import { MonthPicker } from "@/components/ui/month-picker";
import { useNavigationProgress } from "@/components/providers/navigation-progress";

export function MonthNav({ month }: { month?: string }) {
  const { navigate } = useNavigationProgress();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // `month` is the server-resolved default (Cards page may auto-advance to next month when every
  // current invoice is paid); fall back to it whenever the URL has no explicit `?month=`.
  const currentMonth = searchParams.get("month") ?? month ?? monthKey(todayIso());

  function setMonth(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", value);
    navigate(`${pathname}?${params.toString()}`);
  }

  return <MonthPicker month={currentMonth} onChange={setMonth} />;
}
