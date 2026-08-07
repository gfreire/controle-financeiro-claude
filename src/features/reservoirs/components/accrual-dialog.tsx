"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, Textarea, FieldError } from "@/components/ui/input";
import { addReservoirAccrualAction } from "../actions";
import { reservoirAccrualSchema } from "@/lib/validations/reservoirs";
import { calculateGrossNetSplit } from "@/lib/utils/money";
import { todayIso } from "@/lib/utils/date";

export function AccrualDialog({ reservoirId, reservoirName, trigger }: { reservoirId: string; reservoirName: string; trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [date, setDate] = useState(todayIso());
  const [description, setDescription] = useState(`Movimentação da receita programada ${reservoirName}`);
  const [grossAmount, setGrossAmount] = useState("");
  const [percentage, setPercentage] = useState("");
  const [amount, setAmount] = useState("");

  function handlePercentageChange(value: string) {
    setPercentage(value);
    const result = calculateGrossNetSplit(
      { grossAmount: grossAmount ? Number(grossAmount) : undefined, percentage: value ? Number(value) : undefined },
      "percentage"
    );
    if (result.netAmount !== undefined) setAmount(String(result.netAmount));
  }

  function handleAmountChange(value: string) {
    setAmount(value);
    const result = calculateGrossNetSplit(
      { grossAmount: grossAmount ? Number(grossAmount) : undefined, netAmount: value ? Number(value) : undefined },
      "netAmount"
    );
    if (result.percentage !== undefined) setPercentage(String(result.percentage));
  }

  function handleSubmit() {
    setError(null);
    const parsed = reservoirAccrualSchema.safeParse({
      reservoirId,
      date,
      amount: Number(amount),
      grossAmount: grossAmount ? Number(grossAmount) : undefined,
      percentage: percentage ? Number(percentage) : undefined,
      description: description || undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    startTransition(async () => {
      try {
        await addReservoirAccrualAction(parsed.data);
        router.refresh();
        setOpen(false);
        setGrossAmount(""); setPercentage(""); setAmount("");
        setDescription(`Movimentação da receita programada ${reservoirName}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao lançar acúmulo");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle>Lançar acúmulo</DialogTitle>
        <Field>
          <Label>Data</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field>
          <Label>Valor bruto (opcional)</Label>
          <Input type="number" step="0.01" value={grossAmount} onChange={(e) => setGrossAmount(e.target.value)} placeholder="Ex: valor antes da taxa" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field>
            <Label>Percentual (%)</Label>
            <Input type="number" step="0.01" min={0} max={100} value={percentage} onChange={(e) => handlePercentageChange(e.target.value)} disabled={!grossAmount} />
          </Field>
          <Field>
            <Label>Valor líquido</Label>
            <Input type="number" step="0.01" value={amount} onChange={(e) => handleAmountChange(e.target.value)} />
          </Field>
        </div>
        <Field>
          <Label>Descrição</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </Field>
        <FieldError>{error}</FieldError>
        <DialogActions>
          <DialogClose asChild><Button variant="secondary" size="sm">Cancelar</Button></DialogClose>
          <Button size="sm" disabled={pending || !amount} onClick={handleSubmit}>{pending ? "Salvando..." : "Salvar"}</Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
