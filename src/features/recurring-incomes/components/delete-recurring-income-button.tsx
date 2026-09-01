"use client";

import { useRouter } from "next/navigation";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { deleteRecurringIncomeAction } from "../actions";
import { Trash2 } from "lucide-react";

export function DeleteRecurringIncomeButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();

  return (
    <ConfirmDeleteDialog
      trigger={
        <button className="p-1.5 -m-1.5 text-text/40 hover:text-danger-600" aria-label="Excluir receita recorrente">
          <Trash2 className="size-3.5" strokeWidth={1.5} />
        </button>
      }
      title={`Excluir receita recorrente "${name}"?`}
      description="Some da lista de recebimentos do mês. Recebimentos já registrados não são apagados — só perdem o vínculo com este modelo."
      onConfirm={async () => {
        await deleteRecurringIncomeAction(id);
        router.refresh();
      }}
    />
  );
}
