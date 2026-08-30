"use client";

import { useRouter } from "next/navigation";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { deleteGoalEntryAction, deleteGoalYieldAction } from "../actions";
import { Trash2 } from "lucide-react";
import type { GoalEntryDTO } from "@/types/dto";

const LABEL: Record<GoalEntryDTO["kind"], string> = {
  RESERVE: "aporte",
  REDEEM: "resgate",
  YIELD: "rendimento",
};

export function DeleteGoalEntryButton({ entry }: { entry: GoalEntryDTO }) {
  const router = useRouter();
  const kindLabel = LABEL[entry.kind];

  return (
    <ConfirmDeleteDialog
      trigger={
        <button type="button" className="p-1.5 -m-1.5 opacity-60 hover:opacity-100 hover:text-danger-600" aria-label={`Excluir ${kindLabel}`}>
          <Trash2 className="size-3" strokeWidth={1.5} />
        </button>
      }
      title={`Excluir este ${kindLabel}?`}
      description={
        entry.kind === "YIELD"
          ? "O rendimento informado é removido e o saldo da meta recalcula."
          : "O lançamento é removido e o saldo da conta volta ao que era. Use para corrigir um erro de digitação."
      }
      onConfirm={async () => {
        if (entry.kind === "YIELD") {
          await deleteGoalYieldAction(entry.id);
        } else {
          await deleteGoalEntryAction(entry.id);
        }
        router.refresh();
      }}
    />
  );
}
