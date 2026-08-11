"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { AccountSelect } from "@/components/ui/account-select";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, FieldError } from "@/components/ui/input";
import { CategorySelect } from "@/features/categories/components/category-select";
import { Plus } from "lucide-react";
import { createReservoirAction, updateReservoirAction } from "../actions";
import { reservoirSchema, updateReservoirSchema } from "@/lib/validations/reservoirs";
import type { AccountDTO, CategoryDTO, ReservoirDTO } from "@/types/dto";

const NONE = "NONE";

export function ReservoirFormDialog({
  categories: initialCategories,
  accounts,
  reservoir,
  trigger,
}: {
  categories: CategoryDTO[];
  accounts: AccountDTO[];
  /** Present → edit mode: prefills from this reservoir and saves via updateReservoirAction. */
  reservoir?: ReservoirDTO;
  trigger?: React.ReactNode;
}) {
  const isEdit = !!reservoir;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState(initialCategories);
  const [name, setName] = useState(reservoir?.name ?? "");
  const [categoryId, setCategoryId] = useState(reservoir?.categoryId ?? NONE);
  const [defaultPercentage, setDefaultPercentage] = useState(reservoir?.defaultPercentage !== undefined ? String(reservoir.defaultPercentage) : "");
  const [defaultDestinationAccountId, setDefaultDestinationAccountId] = useState(reservoir?.defaultDestinationAccountId ?? NONE);

  function handleSubmit() {
    setError(null);
    const payload = {
      name,
      categoryId: categoryId === NONE ? undefined : categoryId,
      defaultPercentage: defaultPercentage ? Number(defaultPercentage) : undefined,
      defaultDestinationAccountId: defaultDestinationAccountId === NONE ? undefined : defaultDestinationAccountId,
    };
    const parsed = isEdit
      ? updateReservoirSchema.safeParse({ id: reservoir!.id, ...payload })
      : reservoirSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    startTransition(async () => {
      try {
        if (isEdit) {
          await updateReservoirAction(parsed.data as Parameters<typeof updateReservoirAction>[0]);
        } else {
          await createReservoirAction(parsed.data as Parameters<typeof createReservoirAction>[0]);
          setName("");
        }
        router.refresh();
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : `Erro ao ${isEdit ? "editar" : "criar"} receita programada`);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm"><Plus className="size-3.5" strokeWidth={1.5} /> Nova receita programada</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{isEdit ? "Editar receita programada" : "Nova receita programada"}</DialogTitle>
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
            <AccountSelect
              accounts={accounts}
              value={defaultDestinationAccountId}
              onChange={setDefaultDestinationAccountId}
              noneValue={NONE}
              noneLabel="Nenhuma"
            />
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
