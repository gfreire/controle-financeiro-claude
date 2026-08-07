"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, FieldError } from "@/components/ui/input";
import { Plus } from "lucide-react";
import { createDebtAction } from "../actions";
import { debtSchema } from "@/lib/validations/debts";

export function DebtFormDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [agent, setAgent] = useState("");
  const [side, setSide] = useState<"PAYABLE" | "RECEIVABLE">("PAYABLE");
  const [initialBalance, setInitialBalance] = useState("");

  function handleSubmit() {
    setError(null);
    const parsed = debtSchema.safeParse({ agent, side, initialBalance: Number(initialBalance) });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    startTransition(async () => {
      try {
        await createDebtAction(parsed.data);
        router.refresh();
        setOpen(false);
        setAgent(""); setInitialBalance("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao criar dívida");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="size-3.5" strokeWidth={1.5} /> Nova dívida</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Nova dívida</DialogTitle>
        <Field>
          <Label>Tipo</Label>
          <Select value={side} onValueChange={(v) => setSide(v as typeof side)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="PAYABLE">Devo (a pagar)</SelectItem>
              <SelectItem value="RECEIVABLE">Me devem (a receber)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <Label>{side === "PAYABLE" ? "Para quem devo" : "Quem me deve"}</Label>
          <Input value={agent} onChange={(e) => setAgent(e.target.value)} />
        </Field>
        <Field>
          <Label>Valor inicial</Label>
          <Input type="number" step="0.01" value={initialBalance} onChange={(e) => setInitialBalance(e.target.value)} />
        </Field>
        <FieldError>{error}</FieldError>
        <DialogActions>
          <DialogClose asChild><Button variant="secondary" size="sm">Cancelar</Button></DialogClose>
          <Button size="sm" disabled={pending || !agent || !initialBalance} onClick={handleSubmit}>{pending ? "Salvando..." : "Salvar"}</Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
