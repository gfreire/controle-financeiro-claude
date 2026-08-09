"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cloneBudgetMonthAction } from "../actions";
import { formatMonthLabel } from "@/lib/utils/date";
import { Copy } from "lucide-react";

/** Copies every budget row from `fromMonth` into `toMonth` — see getBudgetMonthWindow's `lastRegisteredMonth` (AI_CONTEXT.md "Budgets"). */
export function CloneBudgetButton({ fromMonth, toMonth }: { fromMonth: string; toMonth: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await cloneBudgetMonthAction(fromMonth, toMonth);
          router.refresh();
        })
      }
    >
      <Copy className="size-3.5" strokeWidth={1.5} /> {pending ? "Clonando..." : `Clonar de ${formatMonthLabel(fromMonth)}`}
    </Button>
  );
}
