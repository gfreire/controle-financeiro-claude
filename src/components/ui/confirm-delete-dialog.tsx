"use client";

import { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogActions, DialogTrigger, DialogClose } from "./dialog";
import { Button } from "./button";
import { FieldError } from "./input";

export function ConfirmDeleteDialog({
  trigger,
  title,
  description,
  onConfirm,
}: {
  trigger: React.ReactNode;
  title: string;
  description?: string;
  onConfirm: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      try {
        await onConfirm();
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao excluir");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle>{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
        <FieldError>{error}</FieldError>
        <DialogActions>
          <DialogClose asChild><Button variant="secondary" size="sm">Cancelar</Button></DialogClose>
          <Button variant="danger" size="sm" disabled={pending} onClick={handleConfirm}>
            {pending ? "Excluindo..." : "Excluir"}
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
