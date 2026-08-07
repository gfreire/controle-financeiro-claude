"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, FieldError } from "@/components/ui/input";
import { Plus } from "lucide-react";
import { createAccountAction } from "../actions";
import { accountSchema } from "@/lib/validations/accounts";
import type { FinancialInstitutionDTO } from "@/types/dto";

const NONE = "NONE";

export function AccountFormDialog({ institutions }: { institutions: FinancialInstitutionDTO[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<"CASH" | "BANK" | "CREDIT_CARD">("BANK");
  const [institutionId, setInstitutionId] = useState(NONE);
  const [name, setName] = useState("");
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false);
  const [initialBalance, setInitialBalance] = useState("0");
  const [overdraftLimit, setOverdraftLimit] = useState("0");
  const [closingDay, setClosingDay] = useState("5");
  const [dueDay, setDueDay] = useState("12");
  const [creditLimit, setCreditLimit] = useState("");

  function handleInstitutionChange(value: string) {
    setInstitutionId(value);
    if (!nameManuallyEdited) {
      const institution = institutions.find((i) => i.id === value);
      setName(institution?.name ?? "");
    }
  }

  function handleNameChange(value: string) {
    setName(value);
    setNameManuallyEdited(true);
  }

  function resetForm() {
    setName("");
    setNameManuallyEdited(false);
    setInstitutionId(NONE);
    setInitialBalance("0");
    setOverdraftLimit("0");
    setCreditLimit("");
  }

  function handleSubmit() {
    setError(null);
    const parsed = accountSchema.safeParse({
      type,
      name,
      institutionId: institutionId === NONE ? undefined : institutionId,
      initialBalance: type === "CASH" || type === "BANK" ? Number(initialBalance) : undefined,
      overdraftLimit: type === "BANK" ? Number(overdraftLimit) : undefined,
      closingDay: type === "CREDIT_CARD" ? Number(closingDay) : undefined,
      dueDay: type === "CREDIT_CARD" ? Number(dueDay) : undefined,
      creditLimit: type === "CREDIT_CARD" && creditLimit ? Number(creditLimit) : undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    startTransition(async () => {
      try {
        await createAccountAction(parsed.data);
        router.refresh();
        setOpen(false);
        resetForm();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao criar conta");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="size-3.5" strokeWidth={1.5} /> Nova conta</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Nova conta</DialogTitle>
        <Field>
          <Label>Tipo</Label>
          <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="CASH">Dinheiro</SelectItem>
              <SelectItem value="BANK">Conta bancária</SelectItem>
              <SelectItem value="CREDIT_CARD">Cartão de crédito</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <Label>Instituição</Label>
          <Select value={institutionId} onValueChange={handleInstitutionChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Nenhuma</SelectItem>
              {institutions.map((i) => (
                <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <Label>Nome da conta</Label>
          <Input
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Ex: Carteira, Cofrinhos Nomeados, Conta Amazon..."
          />
        </Field>

        {(type === "CASH" || type === "BANK") && (
          <Field>
            <Label>Saldo inicial</Label>
            <Input type="number" step="0.01" value={initialBalance} onChange={(e) => setInitialBalance(e.target.value)} />
          </Field>
        )}
        {type === "BANK" && (
          <Field>
            <Label>Limite de cheque especial</Label>
            <Input type="number" step="0.01" value={overdraftLimit} onChange={(e) => setOverdraftLimit(e.target.value)} />
          </Field>
        )}
        {type === "CREDIT_CARD" && (
          <div className="grid grid-cols-2 gap-2">
            <Field>
              <Label>Dia de fechamento</Label>
              <Input type="number" min={1} max={31} value={closingDay} onChange={(e) => setClosingDay(e.target.value)} />
            </Field>
            <Field>
              <Label>Dia de vencimento</Label>
              <Input type="number" min={1} max={31} value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
            </Field>
          </div>
        )}
        {type === "CREDIT_CARD" && (
          <Field>
            <Label>Limite do cartão (opcional)</Label>
            <Input type="number" step="0.01" min="0" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} placeholder="Deixe em branco se não quiser alertas de limite" />
          </Field>
        )}

        <FieldError>{error}</FieldError>
        <DialogActions>
          <DialogClose asChild><Button variant="secondary" size="sm">Cancelar</Button></DialogClose>
          <Button size="sm" disabled={pending || !name} onClick={handleSubmit}>{pending ? "Salvando..." : "Salvar"}</Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
