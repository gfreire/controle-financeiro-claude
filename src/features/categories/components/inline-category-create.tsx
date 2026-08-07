"use client";

import { useState, useTransition } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, FieldError } from "@/components/ui/input";
import { IconPicker } from "@/components/ui/icon-picker";
import { CATEGORY_ICONS } from "@/components/ui/icon-set";
import { Plus } from "lucide-react";
import { createCategoryAction, createSubcategoryAction } from "../actions";
import { categorySchema, subcategorySchema } from "@/lib/validations/categories";
import type { CategoryDTO, SubcategoryDTO } from "@/types/dto";

const COLORS = ["#5980a6", "#4a7a5c", "#9a4f37", "#a87e2e", "#728fab", "#7a3d2b"];

/**
 * Inline category creation from the transaction/card-purchase forms (AI_GENERATION_RULES.md
 * "Form Rules": categories/subcategories can be created without leaving the screen). Calls back
 * with the created row so the parent form can append it to its local options and select it,
 * instead of a full page refresh.
 */
export function InlineCategoryCreate({ type, onCreated }: { type: "INCOME" | "EXPENSE"; onCreated: (category: CategoryDTO) => void }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(CATEGORY_ICONS[0]);
  const [color, setColor] = useState(COLORS[0]);

  function handleSubmit() {
    setError(null);
    const parsed = categorySchema.safeParse({ name, type, icon, color });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    startTransition(async () => {
      try {
        const created = await createCategoryAction(parsed.data);
        onCreated(created);
        setOpen(false);
        setName("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao criar categoria");
      }
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger type="button" className="flex items-center gap-1 text-[11px] text-accent hover:underline">
        <Plus className="size-3" strokeWidth={1.5} /> Nova categoria
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-64 flex-col gap-2">
        <div className="flex gap-2">
          <IconPicker value={icon} onChange={setIcon} />
          <Field className="flex-1">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
        </div>
        <div className="flex gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={color === c ? "size-5 ring-2 ring-offset-1 ring-offset-bg ring-accent" : "size-5"}
              style={{ background: c }}
            />
          ))}
        </div>
        <FieldError>{error}</FieldError>
        <Button size="sm" disabled={pending || !name} onClick={handleSubmit}>{pending ? "Criando..." : "Criar categoria"}</Button>
      </PopoverContent>
    </Popover>
  );
}

export function InlineSubcategoryCreate({ categoryId, onCreated }: { categoryId: string; onCreated: (subcategory: SubcategoryDTO) => void }) {
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
        const created = await createSubcategoryAction(parsed.data);
        onCreated(created);
        setOpen(false);
        setName("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao criar subcategoria");
      }
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger type="button" className="flex items-center gap-1 text-[11px] text-accent hover:underline">
        <Plus className="size-3" strokeWidth={1.5} /> Nova subcategoria
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-56 flex-col gap-2">
        <Field>
          <Label>Nome</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <FieldError>{error}</FieldError>
        <Button size="sm" disabled={pending || !name} onClick={handleSubmit}>{pending ? "Criando..." : "Criar subcategoria"}</Button>
      </PopoverContent>
    </Popover>
  );
}
