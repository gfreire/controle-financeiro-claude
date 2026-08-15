"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { useNavigationProgress } from "@/components/providers/navigation-progress";

const OPTIONS = [
  { value: "all", label: "Todas as contas" },
  { value: "liquid", label: "Dinheiro + Banco" },
  { value: "cards", label: "Cartões" },
] as const;

/** Segments the expense donut+comparison pair only — a plain EXPENSE transaction never posts
 *  against a CREDIT_CARD account, so "liquid"/"cards" cleanly splits transactions vs. card
 *  installments (see DashboardFilters.source). Deliberately local to these two charts, not the
 *  global filter bar — the rest of the dashboard keeps summing every account type together. */
export function ExpenseSourceToggle() {
  const { navigate } = useNavigationProgress();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = searchParams.get("expenseSource") ?? "all";

  function setSource(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") params.delete("expenseSource");
    else params.set("expenseSource", value);
    navigate(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="inline-flex overflow-hidden border border-divider text-[12px]">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => setSource(o.value)}
          className={cn(
            "border-l border-divider px-2.5 py-1 first:border-l-0",
            active === o.value ? "bg-accent text-bg" : "hover:bg-text/[0.06]"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
