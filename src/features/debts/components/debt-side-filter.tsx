"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { useNavigationProgress } from "@/components/providers/navigation-progress";

const OPTIONS = [
  { value: "all", label: "Todas" },
  { value: "PAYABLE", label: "A pagar" },
  { value: "RECEIVABLE", label: "A receber" },
] as const;

export function DebtSideFilter() {
  const { navigate } = useNavigationProgress();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = searchParams.get("side") ?? "all";

  function setSide(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") params.delete("side");
    else params.set("side", value);
    navigate(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="inline-flex overflow-hidden border border-divider text-[12px]">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => setSide(o.value)}
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
