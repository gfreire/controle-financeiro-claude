"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Field, Label } from "@/components/ui/input";
import { Layers } from "lucide-react";
import { bulkReassignTransactions } from "../actions";
import type { CategoryDTO } from "@/types/dto";

const UNCATEGORIZED = "UNCATEGORIZED";

export function BatchReassignDialog({ categories }: { categories: CategoryDTO[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [fromId, setFromId] = useState(UNCATEGORIZED);
  const [toId, setToId] = useState<string>("");

  function handleApply() {
    startTransition(async () => {
      await bulkReassignTransactions({
        ...(fromId === UNCATEGORIZED ? { fromUncategorized: true } : { fromCategoryId: fromId }),
        toCategoryId: toId === UNCATEGORIZED ? null : toId,
      });
      router.refresh();
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <Layers className="size-3.5" strokeWidth={1.5} />
          Reclassificar em lote
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Reclassificar em lote</DialogTitle>
        <DialogDescription>
          Move todos os lançamentos de uma categoria (ou sem categoria) para outra de uma vez.
        </DialogDescription>
        <Field>
          <Label>De</Label>
          <Select value={fromId} onValueChange={setFromId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={UNCATEGORIZED}>Sem categoria</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <Label>Para</Label>
          <Select value={toId} onValueChange={setToId}>
            <SelectTrigger><SelectValue placeholder="Selecione a categoria de destino" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={UNCATEGORIZED}>Sem categoria</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <DialogActions>
          <DialogClose asChild>
            <Button variant="secondary" size="sm">Cancelar</Button>
          </DialogClose>
          <Button size="sm" disabled={!toId || pending} onClick={handleApply}>
            {pending ? "Aplicando..." : "Aplicar"}
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
