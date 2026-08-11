"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, FieldError } from "@/components/ui/input";
import { CategorySelect } from "@/features/categories/components/category-select";
import { Plus } from "lucide-react";
import { createDebtAction, updateDebtAction } from "../actions";
import { debtSchema, updateDebtSchema } from "@/lib/validations/debts";
import type { CategoryDTO, DebtDTO } from "@/types/dto";

const NONE = "NONE";

export function DebtFormDialog({
  categories: initialCategories,
  debt,
  trigger,
}: {
  categories: CategoryDTO[];
  /** Present → edit mode: prefills from this debt and saves via updateDebtAction. */
  debt?: DebtDTO;
  trigger?: React.ReactNode;
}) {
  const isEdit = !!debt;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState(initialCategories);
  const [agent, setAgent] = useState(debt?.agent ?? "");
  const [side, setSide] = useState<"PAYABLE" | "RECEIVABLE">(debt?.side ?? "PAYABLE");
  const [initialBalance, setInitialBalance] = useState(debt?.originalAmount !== undefined ? String(debt.originalAmount) : "");
  const [defaultCategoryId, setDefaultCategoryId] = useState(debt?.defaultCategoryId ?? NONE);

  // A debt's default category is used when its *payment* is registered — for PAYABLE that's
  // always an EXPENSE (paying off what's owed), for RECEIVABLE always an INCOME (money coming
  // in), see debts.service.ts#addDebtTransaction.
  const categoryType = side === "PAYABLE" ? "EXPENSE" : "INCOME";

  function handleSubmit() {
    setError(null);
    const payload = {
      agent,
      side,
      initialBalance: Number(initialBalance),
      defaultCategoryId: defaultCategoryId === NONE ? null : defaultCategoryId,
    };
    if (isEdit) {
      const parsed = updateDebtSchema.safeParse({ id: debt!.id, ...payload });
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "Dados inválidos");
        return;
      }
      startTransition(async () => {
        try {
          await updateDebtAction(parsed.data);
          router.refresh();
          setOpen(false);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Erro ao editar dívida");
        }
      });
      return;
    }

    const parsed = debtSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    startTransition(async () => {
      try {
        await createDebtAction(parsed.data);
        router.refresh();
        setOpen(false);
        setAgent(""); setInitialBalance(""); setDefaultCategoryId(NONE);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao criar dívida");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button size="sm"><Plus className="size-3.5" strokeWidth={1.5} /> Nova dívida</Button>}
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{isEdit ? "Editar dívida" : "Nova dívida"}</DialogTitle>
        <Field>
          <Label>Tipo</Label>
          <Select value={side} onValueChange={(v) => { setSide(v as typeof side); setDefaultCategoryId(NONE); }}>
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
        <Field>
          <Label>Categoria padrão (ao pagar)</Label>
          <CategorySelect
            categories={categories}
            type={categoryType}
            value={defaultCategoryId}
            onChange={setDefaultCategoryId}
            onCategoryCreated={(created) => setCategories((prev) => [...prev, created])}
            noneValue={NONE}
            noneLabel="Nenhuma"
          />
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
