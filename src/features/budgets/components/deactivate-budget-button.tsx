"use client";

import { useRouter } from "next/navigation";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { deactivateBudgetAction } from "../actions";
import { Trash2 } from "lucide-react";

export function DeactivateBudgetButton({ budgetId, label }: { budgetId: string; label: string }) {
  const router = useRouter();

  return (
    <ConfirmDeleteDialog
      trigger={
        <button className="p-1.5 -m-1.5 text-text/40 hover:text-danger-600" aria-label="Excluir orçamento">
          <Trash2 className="size-3.5" strokeWidth={1.5} />
        </button>
      }
      title={`Excluir orçamento de "${label}"?`}
      onConfirm={async () => {
        await deactivateBudgetAction(budgetId);
        router.refresh();
      }}
    />
  );
}
