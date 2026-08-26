"use client";

import { useRouter } from "next/navigation";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { deleteFixedExpenseAction } from "../actions";
import { Trash2 } from "lucide-react";

export function DeleteFixedExpenseButton({ fixedExpenseId, name }: { fixedExpenseId: string; name: string }) {
  const router = useRouter();

  return (
    <ConfirmDeleteDialog
      trigger={
        <button className="p-1.5 -m-1.5 text-text/40 hover:text-danger-600" aria-label="Excluir despesa programada">
          <Trash2 className="size-3.5" strokeWidth={1.5} />
        </button>
      }
      title={`Excluir despesa programada "${name}"?`}
      description="A despesa deixa de contar como piso do orçamento da categoria (o orçamento em si não é reduzido automaticamente). Pagamentos já registrados não são apagados — só perdem o vínculo, e podem ser vinculados de novo depois em outra despesa programada."
      onConfirm={async () => {
        await deleteFixedExpenseAction(fixedExpenseId);
        router.refresh();
      }}
    />
  );
}
