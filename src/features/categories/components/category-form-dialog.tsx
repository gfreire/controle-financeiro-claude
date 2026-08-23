"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, FieldError } from "@/components/ui/input";
import { IconPicker } from "@/components/ui/icon-picker";
import { CATEGORY_ICONS } from "@/components/ui/icon-set";
import { ColorPicker, CATEGORY_COLORS } from "@/components/ui/color-picker";
import { Plus, Pencil } from "lucide-react";
import { createCategoryAction, updateCategoryAction } from "../actions";
import { categorySchema } from "@/lib/validations/categories";
import type { CategoryDTO } from "@/types/dto";

export function CategoryFormDialog({
  defaultType = "EXPENSE" as "INCOME" | "EXPENSE",
  category,
  trigger,
}: {
  defaultType?: "INCOME" | "EXPENSE";
  /** Present → edit mode: prefills from this category (name/icon/color only — type is fixed after creation) and saves via updateCategoryAction. */
  category?: CategoryDTO;
  trigger?: React.ReactNode;
}) {
  const isEdit = !!category;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(category?.name ?? "");
  const [type, setType] = useState<"INCOME" | "EXPENSE">(category?.type ?? defaultType);
  const [icon, setIcon] = useState(category?.icon ?? CATEGORY_ICONS[0]);
  const [color, setColor] = useState(category?.color ?? CATEGORY_COLORS[0]);

  // The dialog instance stays mounted across parent re-renders (e.g. an inline edit elsewhere
  // triggering router.refresh()), so useState's one-time initializer never sees a fresher
  // `category` prop on its own. Re-sync from it on every open, using React's documented
  // render-phase "adjusting state when a prop changes" pattern (not an Effect — an Effect
  // would run one render late, and re-setting state synchronously inside it is flagged by
  // react-hooks/set-state-in-effect anyway).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setName(category?.name ?? "");
      setType(category?.type ?? defaultType);
      setIcon(category?.icon ?? CATEGORY_ICONS[0]);
      setColor(category?.color ?? CATEGORY_COLORS[0]);
    }
  }

  function handleSubmit() {
    setError(null);
    const parsed = categorySchema.safeParse({ name, type, icon, color });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    startTransition(async () => {
      try {
        if (isEdit) {
          await updateCategoryAction({ id: category!.id, name: parsed.data.name, icon: parsed.data.icon, color: parsed.data.color });
        } else {
          await createCategoryAction(parsed.data);
        }
        router.refresh();
        setOpen(false);
        if (!isEdit) setName("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao salvar categoria");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="secondary"><Plus className="size-3.5" strokeWidth={1.5} /> Nova categoria</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{isEdit ? "Editar categoria" : "Nova categoria"}</DialogTitle>
        <Field>
          <Label>Tipo</Label>
          <Select value={type} onValueChange={(v) => setType(v as typeof type)} disabled={isEdit}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="EXPENSE">Despesa</SelectItem>
              <SelectItem value="INCOME">Receita</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Field>
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field>
            <Label>Ícone</Label>
            <IconPicker value={icon} onChange={setIcon} />
          </Field>
        </div>
        <Field>
          <Label>Cor</Label>
          <ColorPicker value={color} onChange={setColor} />
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
