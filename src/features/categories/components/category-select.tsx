"use client";

import { useState, useTransition } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, FieldError } from "@/components/ui/input";
import { IconPicker } from "@/components/ui/icon-picker";
import { CATEGORY_ICONS } from "@/components/ui/icon-set";
import { ColorPicker, CATEGORY_COLORS } from "@/components/ui/color-picker";
import { Plus } from "lucide-react";
import { createCategoryAction, createSubcategoryAction } from "../actions";
import { categorySchema, subcategorySchema } from "@/lib/validations/categories";
import type { CategoryDTO, SubcategoryDTO } from "@/types/dto";

const CREATE_CATEGORY = "__create_category__";
const CREATE_SUBCATEGORY = "__create_subcategory__";

/**
 * Standard category/subcategory picker across the app: every select that lets the user assign a
 * category also lets them create one, via a "Nova categoria" item at the end of the same dropdown
 * (AI_GENERATION_RULES.md "Form Rules") — no separate button needed, so it fits even a compact
 * table-row cell. Selecting the sentinel opens a small creation dialog instead of a real value.
 */
export function CategorySelect({
  categories,
  value,
  onChange,
  type,
  onCategoryCreated,
  noneValue,
  noneLabel,
  placeholder = "Selecione",
  disabled,
  triggerClassName,
}: {
  categories: CategoryDTO[];
  value: string;
  onChange: (id: string) => void;
  type: "INCOME" | "EXPENSE";
  onCategoryCreated?: (category: CategoryDTO) => void;
  noneValue?: string;
  noneLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  triggerClassName?: string;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(CATEGORY_ICONS[0]);
  const [color, setColor] = useState(CATEGORY_COLORS[0]);

  const relevantCategories = categories.filter((c) => c.type === type);

  function handleValueChange(v: string) {
    if (v === CREATE_CATEGORY) {
      setCreateOpen(true);
      return;
    }
    onChange(v);
  }

  function handleCreate() {
    setError(null);
    const parsed = categorySchema.safeParse({ name, type, icon, color });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    startTransition(async () => {
      try {
        const created = await createCategoryAction(parsed.data);
        onCategoryCreated?.(created);
        onChange(created.id);
        setCreateOpen(false);
        setName("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao criar categoria");
      }
    });
  }

  return (
    <>
      <Select value={value} onValueChange={handleValueChange} disabled={disabled}>
        <SelectTrigger className={triggerClassName}><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>
          {noneValue !== undefined && <SelectItem value={noneValue}>{noneLabel}</SelectItem>}
          {relevantCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>)}
          <SelectItem value={CREATE_CATEGORY} className="text-accent">
            <Plus className="size-3.5" strokeWidth={1.5} /> Nova categoria
          </SelectItem>
        </SelectContent>
      </Select>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogTitle>Nova categoria</DialogTitle>
          <div className="flex gap-2">
            <IconPicker value={icon} onChange={setIcon} />
            <Field className="flex-1">
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </Field>
          </div>
          <ColorPicker value={color} onChange={setColor} size="size-5" />
          <FieldError>{error}</FieldError>
          <Button size="sm" disabled={pending || !name} onClick={handleCreate}>{pending ? "Criando..." : "Criar categoria"}</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function SubcategorySelect({
  subcategories,
  value,
  onChange,
  categoryId,
  onSubcategoryCreated,
  noneValue,
  noneLabel,
  placeholder = "Selecione",
  disabled,
  triggerClassName,
}: {
  subcategories: SubcategoryDTO[];
  value: string;
  onChange: (id: string) => void;
  categoryId: string;
  onSubcategoryCreated?: (subcategory: SubcategoryDTO) => void;
  noneValue?: string;
  noneLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  triggerClassName?: string;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");

  function handleValueChange(v: string) {
    if (v === CREATE_SUBCATEGORY) {
      setCreateOpen(true);
      return;
    }
    onChange(v);
  }

  function handleCreate() {
    setError(null);
    const parsed = subcategorySchema.safeParse({ categoryId, name });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    startTransition(async () => {
      try {
        const created = await createSubcategoryAction(parsed.data);
        onSubcategoryCreated?.(created);
        onChange(created.id);
        setCreateOpen(false);
        setName("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao criar subcategoria");
      }
    });
  }

  return (
    <>
      <Select value={value} onValueChange={handleValueChange} disabled={disabled}>
        <SelectTrigger className={triggerClassName}><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>
          {noneValue !== undefined && <SelectItem value={noneValue}>{noneLabel}</SelectItem>}
          {subcategories.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          <SelectItem value={CREATE_SUBCATEGORY} className="text-accent">
            <Plus className="size-3.5" strokeWidth={1.5} /> Nova subcategoria
          </SelectItem>
        </SelectContent>
      </Select>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogTitle>Nova subcategoria</DialogTitle>
          <Field>
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <FieldError>{error}</FieldError>
          <Button size="sm" disabled={pending || !name} onClick={handleCreate}>{pending ? "Criando..." : "Criar subcategoria"}</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
