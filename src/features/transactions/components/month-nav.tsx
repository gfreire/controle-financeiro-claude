"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { monthKey, todayIso } from "@/lib/utils/date";
import { MonthPicker } from "@/components/ui/month-picker";

export function MonthNav() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentMonth = searchParams.get("month") ?? monthKey(todayIso());

  function setMonth(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return <MonthPicker month={currentMonth} onChange={setMonth} />;
}
