"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { monthKey, todayIso } from "@/lib/utils/date";
import { MonthPicker } from "@/components/ui/month-picker";
import { useNavigationProgress } from "@/components/providers/navigation-progress";

export function MonthNav() {
  const { navigate } = useNavigationProgress();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentMonth = searchParams.get("month") ?? monthKey(todayIso());

  function setMonth(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", value);
    navigate(`${pathname}?${params.toString()}`);
  }

  return <MonthPicker month={currentMonth} onChange={setMonth} />;
}
