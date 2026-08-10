"use client";

import { useRouter } from "next/navigation";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { deleteTransactionAction } from "../actions";
import { Trash2 } from "lucide-react";

export function DeleteTransactionButton({ transactionId, description }: { transactionId: string; description: string }) {
  const router = useRouter();

  return (
    <ConfirmDeleteDialog
      trigger={
        <button className="p-1.5 -m-1.5 text-text/40 hover:text-danger-600" aria-label="Excluir lançamento">
          <Trash2 className="size-3.5" strokeWidth={1.5} />
        </button>
      }
      title={`Excluir "${description || "lançamento"}"?`}
      onConfirm={async () => {
        await deleteTransactionAction(transactionId);
        router.refresh();
      }}
    />
  );
}
