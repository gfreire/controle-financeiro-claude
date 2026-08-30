"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { updateGoalAction } from "../actions";
import { formatMonthLabel } from "@/lib/utils/date";
import { formatCurrency } from "@/lib/utils/currency";

/**
 * "Recalcular" — snapshots the schedule to today: the aporte mensal is recomputed from what's
 * been saved so far and the remaining months to the deadline. The ledger (aportes/rendimentos)
 * is untouched. Only offered when the goal has a deadline.
 */
export function RecalculateGoalButton({
  goalId,
  currentBalance,
  goalTarget,
  endDate,
}: {
  goalId: string;
  currentBalance: number;
  goalTarget: number;
  endDate: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      try {
        await updateGoalAction({ id: goalId, rebase: true });
        router.refresh();
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao recalcular");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className="inline-flex items-center gap-1 text-[11px] text-accent underline hover:opacity-80">
          <RefreshCw className="size-3" strokeWidth={1.5} /> Recalcular
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Recalcular aporte mensal</DialogTitle>
        <p className="text-xs opacity-70">
          O aporte mensal passa a ser calculado de hoje até {formatMonthLabel(endDate)}, com base no que você já guardou
          ({formatCurrency(currentBalance)} de {formatCurrency(goalTarget)}). Os aportes e rendimentos já lançados não mudam.
        </p>
        {error && <p className="text-xs text-danger-600">{error}</p>}
        <DialogActions>
          <DialogClose asChild><Button variant="secondary" size="sm">Cancelar</Button></DialogClose>
          <Button size="sm" disabled={pending} onClick={handleConfirm}>{pending ? "Recalculando..." : "Recalcular"}</Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
