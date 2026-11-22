"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { deleteReportAction } from "../actions";

export function DeleteReportButton({ reportId, name }: { reportId: string; name: string }) {
  const router = useRouter();
  return (
    <ConfirmDeleteDialog
      trigger={
        <Button size="sm" variant="secondary" aria-label="Excluir relatório">
          <Trash2 className="size-3.5" strokeWidth={1.5} />
        </Button>
      }
      title={`Excluir o relatório "${name}"?`}
      description="Só o filtro salvo é apagado — nenhum lançamento é alterado."
      onConfirm={async () => {
        await deleteReportAction(reportId);
        router.push("/reports");
      }}
    />
  );
}
