"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, FieldError } from "@/components/ui/input";
import { CategorySelect } from "@/features/categories/components/category-select";
import { Plus } from "lucide-react";
import { createReservoirAction } from "../actions";
import { reservoirSchema } from "@/lib/validations/reservoirs";
import type { AccountDTO, CategoryDTO } from "@/types/dto";

const NONE = "NONE";

export function ReservoirFormDialog({ categories: initialCategories, accounts }: { categories: CategoryDTO[]; accounts: AccountDTO[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState(initialCategories);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState(NONE);
  const [defaultPercentage, setDefaultPercentage] = useState("");
  const [defaultDestinationAccountId, setDefaultDestinationAccountId] = useState(NONE);

  function handleSubmit() {
    setError(null);
    const parsed = reservoirSchema.safeParse({
      name,
      categoryId: categoryId === NONE ? undefined : categoryId,
      defaultPercentage: defaultPercentage ? Number(defaultPercentage) : undefined,
      defaultDestinationAccountId: defaultDestinationAccountId === NONE ? undefined : defaultDestinationAccountId,
    });
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
          <CategorySelect
            categories={categories}
            type="INCOME"
            value={categoryId}
            onChange={setCategoryId}
            onCategoryCreated={(created) => setCategories((prev) => [...prev, created])}
            noneValue={NONE}
            noneLabel="Nenhuma"
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field>
            <Label>Percentual padrão (%, opcional)</Label>
            <Input type="number" step="0.01" min={0} max={100} value={defaultPercentage} onChange={(e) => setDefaultPercentage(e.target.value)} />
          </Field>
          <Field>
            <Label>Conta de destino padrão (opcional)</Label>
            <Select value={defaultDestinationAccountId} onValueChange={setDefaultDestinationAccountId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Nenhuma</SelectItem>
                {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <FieldError>{error}</FieldError>
        <DialogActions>
          <DialogClose asChild><Button variant="secondary" size="sm">Cancelar</Button></DialogClose>
          <Button size="sm" disabled={pending || !name} onClick={handleSubmit}>{pending ? "Salvando..." : "Salvar"}</Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
