"use client";

import { useRouter } from "next/navigation";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { deleteCardPurchaseAction } from "../actions";
import { Trash2 } from "lucide-react";

export function DeletePurchaseButton({ purchaseId, description }: { purchaseId: string; description: string }) {
  const router = useRouter();

  return (
    <ConfirmDeleteDialog
      trigger={
        <button className="text-text/40 hover:text-danger-600" aria-label="Excluir compra">
          <Trash2 className="size-3.5" strokeWidth={1.5} />
        </button>
      }
      title={`Excluir "${description || "compra"}"?`}
      description="Todas as parcelas dessa compra serão excluídas junto."
      onConfirm={async () => {
        await deleteCardPurchaseAction(purchaseId);
        router.refresh();
      }}
    />
  );
}
