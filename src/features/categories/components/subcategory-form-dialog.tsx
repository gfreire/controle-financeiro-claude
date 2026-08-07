"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, FieldError } from "@/components/ui/input";
import { Plus } from "lucide-react";
import { createSubcategoryAction } from "../actions";
import { subcategorySchema } from "@/lib/validations/categories";

export function SubcategoryFormDialog({ categoryId }: { categoryId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");

  function handleSubmit() {
    setError(null);
    const parsed = subcategorySchema.safeParse({ categoryId, name });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    startTransition(async () => {
      try {
        await createSubcategoryAction(parsed.data);
        router.refresh();
        setOpen(false);
        setName("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao criar subcategoria");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex items-center gap-1 text-[11px] text-accent hover:underline">
          <Plus className="size-3" strokeWidth={1.5} /> Subcategoria
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Nova subcategoria</DialogTitle>
        <Field>
          <Label>Nome</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <FieldError>{error}</FieldError>
        <DialogActions>
          <DialogClose asChild><Button variant="secondary" size="sm">Cancelar</Button></DialogClose>
          <Button size="sm" disabled={pending || !name} onClick={handleSubmit}>{pending ? "Salvando..." : "Salvar"}</Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
