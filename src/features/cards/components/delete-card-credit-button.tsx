"use client";

import { useRouter } from "next/navigation";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { deleteCardCreditAction } from "../actions";
import { Trash2 } from "lucide-react";

/** Only for a standalone credit ("Lançar crédito") — a full purchase refund has no undo path. */
export function DeleteCardCreditButton({ creditId, description }: { creditId: string; description: string }) {
  const router = useRouter();

  return (
    <ConfirmDeleteDialog
      trigger={
        <button className="p-1.5 -m-1.5 text-text/40 hover:text-danger-600" aria-label="Excluir crédito">
          <Trash2 className="size-3.5" strokeWidth={1.5} />
        </button>
      }
      title={`Excluir "${description || "crédito"}"?`}
      description="O crédito deixa de abater a fatura e sai das receitas do mês."
      onConfirm={async () => {
        await deleteCardCreditAction(creditId);
        router.refresh();
      }}
    />
  );
}
