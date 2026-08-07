"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, FieldError } from "@/components/ui/input";
import { Plus } from "lucide-react";
import { createReservoirAction } from "../actions";
import { reservoirSchema } from "@/lib/validations/reservoirs";
import type { CategoryDTO } from "@/types/dto";

const NONE = "NONE";

export function ReservoirFormDialog({ categories }: { categories: CategoryDTO[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState(NONE);
  const incomeCategories = categories.filter((c) => c.type === "INCOME");

  function handleSubmit() {
    setError(null);
    const parsed = reservoirSchema.safeParse({ name, categoryId: categoryId === NONE ? undefined : categoryId });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    startTransition(async () => {
      try {
        await createReservoirAction(parsed.data);
        router.refresh();
        setOpen(false);
        setName("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao criar receita programada");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="size-3.5" strokeWidth={1.5} /> Nova receita programada</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Nova receita programada</DialogTitle>
        <Field>
          <Label>Nome</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Poker, Freelance..." />
        </Field>
        <Field>
          <Label>Categoria padrão (ao sacar)</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Nenhuma</SelectItem>
              {incomeCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>)}
            </SelectContent>
          </Select>
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
