"use client";

import { useRouter } from "next/navigation";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { deactivateFixedExpenseAction } from "../actions";
import { Trash2 } from "lucide-react";

export function DeactivateFixedExpenseButton({ fixedExpenseId, name }: { fixedExpenseId: string; name: string }) {
  const router = useRouter();

  return (
    <ConfirmDeleteDialog
      trigger={
        <button className="text-text/40 hover:text-danger-600" aria-label="Excluir despesa fixa">
          <Trash2 className="size-3.5" strokeWidth={1.5} />
        </button>
      }
      title={`Excluir despesa fixa "${name}"?`}
      description="A despesa deixa de contar como piso do orçamento da categoria, mas o orçamento em si não é reduzido automaticamente."
      onConfirm={async () => {
        await deactivateFixedExpenseAction(fixedExpenseId);
        router.refresh();
      }}
    />
  );
}
