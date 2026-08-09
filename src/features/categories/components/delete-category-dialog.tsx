"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";
import { Trash2 } from "lucide-react";
import {
  getCategoryUsageAction,
  getSubcategoryUsageAction,
  deleteCategoryWithReassignmentAction,
  deleteSubcategoryWithReassignmentAction,
} from "../actions";
import type { CategoryDTO, CategoryUsageDTO } from "@/types/dto";

type Target =
  | { kind: "category"; id: string; name: string }
  | { kind: "subcategory"; id: string; name: string; parentCategoryId: string };

type Strategy = "reassign" | "parent" | "uncategorized";

const NONE = "NONE";

export function DeleteCategoryDialog({ target, categories }: { target: Target; categories: CategoryDTO[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<CategoryUsageDTO | null>(null);
  const [strategy, setStrategy] = useState<Strategy>(target.kind === "subcategory" ? "parent" : "uncategorized");
  const [toCategoryId, setToCategoryId] = useState("");
  const [toSubcategoryId, setToSubcategoryId] = useState(NONE);

  const sourceType =
    target.kind === "category"
      ? categories.find((c) => c.id === target.id)?.type
      : categories.find((c) => c.id === target.parentCategoryId)?.type;
  const reassignableCategories = categories.filter((c) => c.id !== target.id && !c.isSystem && c.type === sourceType);
  const selectedTargetCategory = reassignableCategories.find((c) => c.id === toCategoryId);

  useEffect(() => {
    if (!open) return;
    (target.kind === "category" ? getCategoryUsageAction(target.id) : getSubcategoryUsageAction(target.id)).then(setUsage);
  }, [open, target]);

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      try {
        if (target.kind === "category") {
          await deleteCategoryWithReassignmentAction({
            categoryId: target.id,
            toCategoryId: strategy === "uncategorized" ? null : toCategoryId,
            toSubcategoryId: strategy === "reassign" && toSubcategoryId !== NONE ? toSubcategoryId : null,
          });
        } else {
          await deleteSubcategoryWithReassignmentAction({
            subcategoryId: target.id,
            toCategoryId: strategy === "parent" ? target.parentCategoryId : strategy === "uncategorized" ? null : toCategoryId,
            toSubcategoryId: strategy === "reassign" && toSubcategoryId !== NONE ? toSubcategoryId : null,
          });
        }
        router.refresh();
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao excluir");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="text-text/40 hover:text-danger-600"><Trash2 className="size-3.5" strokeWidth={1.5} /></button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Excluir &quot;{target.name}&quot;</DialogTitle>
        {usage === null ? (
          <p className="text-sm opacity-60">Carregando...</p>
        ) : usage.count === 0 && !usage.budgetsCount && !usage.fixedExpensesCount && !usage.reservoirsCount ? (
          <DialogDescription>Nada usa esta categoria — pode excluir com segurança.</DialogDescription>
        ) : (
          <>
            <DialogDescription>
              {usage.count} lançamento(s) usam esta categoria
              {(usage.budgetsCount || usage.fixedExpensesCount || usage.reservoirsCount) > 0 &&
                ` (além de ${usage.budgetsCount} orçamento(s), ${usage.fixedExpensesCount} despesa(s) fixa(s) e ${usage.reservoirsCount} receita(s) programada(s) configuradas com ela)`}
              . Escolha o que fazer com essas referências:
            </DialogDescription>

            <div className="flex flex-col gap-1.5 text-sm">
              {target.kind === "subcategory" && (
                <label className="flex items-center gap-2">
                  <input type="radio" checked={strategy === "parent"} onChange={() => setStrategy("parent")} />
                  Voltar para a categoria mãe (só limpa a subcategoria)
                </label>
              )}
              <label className="flex items-center gap-2">
                <input type="radio" checked={strategy === "reassign"} onChange={() => setStrategy("reassign")} />
                Mover para outra categoria
              </label>
              {strategy === "reassign" && (
                <div className="ml-6 flex flex-col gap-1.5">
                  <Select value={toCategoryId} onValueChange={(v) => { setToCategoryId(v); setToSubcategoryId(NONE); }}>
                    <SelectTrigger className="w-56"><SelectValue placeholder="Selecione a categoria" /></SelectTrigger>
                    <SelectContent>
                      {reassignableCategories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedTargetCategory && selectedTargetCategory.subcategories.length > 0 && (
                    <Select value={toSubcategoryId} onValueChange={setToSubcategoryId}>
                      <SelectTrigger className="w-56"><SelectValue placeholder="Subcategoria (opcional)" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Sem subcategoria</SelectItem>
                        {selectedTargetCategory.subcategories.filter((s) => s.active).map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
              <label className="flex items-center gap-2">
                <input type="radio" checked={strategy === "uncategorized"} onChange={() => setStrategy("uncategorized")} />
                Deixar sem categoria
              </label>
            </div>

            {usage.preview.length > 0 && (
              <ul className="max-h-32 overflow-y-auto text-xs opacity-60">
                {usage.preview.map((p) => (
                  <li key={p.id}>{p.date} — {p.description || "sem descrição"}</li>
                ))}
              </ul>
            )}
          </>
        )}
        <FieldError>{error}</FieldError>
        <DialogActions>
          <DialogClose asChild><Button variant="secondary" size="sm">Cancelar</Button></DialogClose>
          <Button
            variant="danger"
            size="sm"
            disabled={pending || (strategy === "reassign" && !toCategoryId)}
            onClick={handleConfirm}
          >
            {pending ? "Excluindo..." : "Excluir"}
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
