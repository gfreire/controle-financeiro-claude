"use client";

import { useRouter } from "next/navigation";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { deactivateDebtAction } from "../actions";
import { Trash2 } from "lucide-react";

/** Soft delete (active = false, same convention as everywhere else in the schema) — for a debt
 * that's forgiven, or that the user has simply given up on collecting, with no payment involved. */
export function DeleteDebtButton({ debtId, agent }: { debtId: string; agent: string }) {
  const router = useRouter();

  return (
    <ConfirmDeleteDialog
      trigger={
        <button type="button" className="p-1.5 -m-1.5 opacity-50 hover:opacity-100 hover:text-danger-600" aria-label="Excluir dívida">
          <Trash2 className="size-3.5" strokeWidth={1.5} />
        </button>
      }
      title={`Excluir dívida com "${agent}"?`}
      description="Use isto quando a dívida foi perdoada ou você já desistiu de recebê-la — nenhum pagamento é registrado. O histórico de lançamentos já feitos continua existindo."
      onConfirm={async () => {
        await deactivateDebtAction(debtId);
        router.refresh();
      }}
    />
  );
}
