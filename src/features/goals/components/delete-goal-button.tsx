"use client";

import { useRouter } from "next/navigation";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { deleteGoalAction } from "../actions";
import { Trash2 } from "lucide-react";

export function DeleteGoalButton({ goalId, name }: { goalId: string; name: string }) {
  const router = useRouter();

  return (
    <ConfirmDeleteDialog
      trigger={
        <button type="button" className="p-1.5 -m-1.5 opacity-50 hover:opacity-100 hover:text-danger-600" aria-label="Excluir meta">
          <Trash2 className="size-3.5" strokeWidth={1.5} />
        </button>
      }
      title={`Excluir "${name}"?`}
      description="Os aportes e resgates já registrados continuam existindo como lançamentos normais — só o vínculo com esta meta é removido."
      onConfirm={async () => {
        await deleteGoalAction(goalId);
        router.refresh();
      }}
    />
  );
}
