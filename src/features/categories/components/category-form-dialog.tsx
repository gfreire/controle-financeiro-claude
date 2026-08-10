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
import { Plus } from "lucide-react";
import { createCategoryAction } from "../actions";
import { categorySchema } from "@/lib/validations/categories";

export function CategoryFormDialog({ defaultType = "EXPENSE" as "INCOME" | "EXPENSE" }: { defaultType?: "INCOME" | "EXPENSE" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<"INCOME" | "EXPENSE">(defaultType);
  const [icon, setIcon] = useState(CATEGORY_ICONS[0]);
  const [color, setColor] = useState(CATEGORY_COLORS[0]);

  function handleSubmit() {
    setError(null);
    const parsed = categorySchema.safeParse({ name, type, icon, color });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    startTransition(async () => {
      try {
        await createCategoryAction(parsed.data);
        router.refresh();
        setOpen(false);
        setName("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao criar categoria");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary"><Plus className="size-3.5" strokeWidth={1.5} /> Nova categoria</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Nova categoria</DialogTitle>
        <Field>
          <Label>Tipo</Label>
          <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
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
