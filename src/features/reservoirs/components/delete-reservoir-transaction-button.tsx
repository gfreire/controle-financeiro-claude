"use client";

import { useRouter } from "next/navigation";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { deleteReservoirTransactionAction } from "../actions";
import { Trash2 } from "lucide-react";

export function DeleteReservoirTransactionButton({
  entryId,
  description,
  isWithdrawal,
}: {
  entryId: string;
  description: string;
  isWithdrawal: boolean;
}) {
  const router = useRouter();

  return (
    <ConfirmDeleteDialog
      trigger={
        <button type="button" className="p-1.5 -m-1.5 opacity-60 hover:opacity-100 hover:text-danger-600" aria-label="Excluir lançamento">
          <Trash2 className="size-3" strokeWidth={1.5} />
        </button>
      }
      title={`Excluir "${description || "lançamento"}"?`}
      description={isWithdrawal ? "Isso também exclui o lançamento vinculado na conta de destino." : undefined}
      onConfirm={async () => {
        await deleteReservoirTransactionAction(entryId);
        router.refresh();
      }}
    />
  );
}
