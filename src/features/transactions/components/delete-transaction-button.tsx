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
        /* p-2.5 with no counteracting negative margin (unlike the app's usual icon-button
           convention) is deliberate here: three of these sit side by side in a row, and a
           negative margin would make each button's real hit box bleed into its neighbor's —
           with the later button in DOM order winning that overlap, which for this row would
           mean stray taps aimed at "editar"/"estornar" landing on "excluir" instead. Real
           padding grows the button's actual layout size, so the flex gap between buttons keeps
           them from ever overlapping. */
        <button className="p-2.5 text-text/40 hover:text-danger-600" aria-label="Excluir lançamento">
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
