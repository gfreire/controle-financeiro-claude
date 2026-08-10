"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, Textarea, FieldError } from "@/components/ui/input";
import { addReservoirAccrualAction, updateReservoirAccrualAction } from "../actions";
import { reservoirAccrualSchema, updateReservoirAccrualSchema } from "@/lib/validations/reservoirs";
import { calculateGrossNetSplit } from "@/lib/utils/money";
import { todayIso } from "@/lib/utils/date";
import type { ReservoirTransactionDTO } from "@/types/dto";

export function AccrualDialog({
  reservoirId,
  reservoirName,
  defaultPercentage,
  trigger,
  entry,
}: {
  reservoirId: string;
  reservoirName: string;
  defaultPercentage?: number;
  trigger: React.ReactNode;
  /** Present → edit mode: prefills from this accrual entry and saves via updateReservoirAccrualAction. */
  entry?: ReservoirTransactionDTO;
}) {
  const isEdit = !!entry;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [date, setDate] = useState(entry?.date ?? todayIso());
  const [description, setDescription] = useState(entry?.description ?? `Movimentação da receita programada ${reservoirName}`);
  const [grossAmount, setGrossAmount] = useState(entry?.grossAmount !== undefined ? String(entry.grossAmount) : "");
  const [percentage, setPercentage] = useState(
    entry?.percentage !== undefined ? String(entry.percentage) : defaultPercentage !== undefined ? String(defaultPercentage) : ""
  );
  const [amount, setAmount] = useState(entry?.amount !== undefined ? String(entry.amount) : "");

  function handleGrossAmountChange(value: string) {
    setGrossAmount(value);
    const result = calculateGrossNetSplit(
      { grossAmount: value ? Number(value) : undefined, percentage: percentage ? Number(percentage) : undefined },
      "percentage"
    );
    if (result.netAmount !== undefined) setAmount(String(result.netAmount));
  }

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

  function resetToDefaults() {
    setDate(todayIso());
    setGrossAmount("");
    setPercentage(defaultPercentage !== undefined ? String(defaultPercentage) : "");
    setAmount("");
    setDescription(`Movimentação da receita programada ${reservoirName}`);
  }

  function handleSubmit() {
    setError(null);
    if (isEdit) {
      const parsed = updateReservoirAccrualSchema.safeParse({
        id: entry.id,
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
          await updateReservoirAccrualAction(parsed.data);
          router.refresh();
          setOpen(false);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Erro ao editar acúmulo");
        }
      });
      return;
    }

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
        resetToDefaults();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao lançar acúmulo");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle>{isEdit ? "Editar acúmulo" : "Lançar acúmulo"}</DialogTitle>
        <Field>
          <Label>Data</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field>
          <Label>Valor bruto (opcional)</Label>
          <Input type="number" step="0.01" min="0.01" value={grossAmount} onChange={(e) => handleGrossAmountChange(e.target.value)} placeholder="Ex: valor antes da taxa" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field>
            <Label>Percentual (%)</Label>
            <Input type="number" step="0.01" min={0} max={100} value={percentage} onChange={(e) => handlePercentageChange(e.target.value)} />
          </Field>
          <Field>
            <Label>Valor líquido</Label>
            <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => handleAmountChange(e.target.value)} />
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
