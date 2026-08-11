"use client";

import { useRouter } from "next/navigation";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { deleteReservoirAction } from "../actions";
import { Trash2 } from "lucide-react";

export function DeleteReservoirButton({ reservoirId, name }: { reservoirId: string; name: string }) {
  const router = useRouter();

  return (
    <ConfirmDeleteDialog
      trigger={
        <button type="button" className="p-1.5 -m-1.5 opacity-50 hover:opacity-100 hover:text-danger-600" aria-label="Excluir receita programada">
          <Trash2 className="size-3.5" strokeWidth={1.5} />
        </button>
      }
      title={`Excluir "${name}"?`}
      description="Os saques já registrados continuam existindo como lançamentos normais — só o vínculo com esta receita programada é removido."
      onConfirm={async () => {
        await deleteReservoirAction(reservoirId);
        router.refresh();
      }}
    />
  );
}
