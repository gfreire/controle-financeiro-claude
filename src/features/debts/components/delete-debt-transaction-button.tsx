"use client";

import { useRouter } from "next/navigation";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { deleteDebtTransactionAction } from "../actions";
import { Trash2 } from "lucide-react";

export function DeleteDebtTransactionButton({
  entryId,
  description,
  isLinked,
}: {
  entryId: string;
  description: string;
  isLinked: boolean;
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
      description={isLinked ? "Isso também exclui o lançamento vinculado na conta." : undefined}
      onConfirm={async () => {
        await deleteDebtTransactionAction(entryId);
        router.refresh();
      }}
    />
  );
}
