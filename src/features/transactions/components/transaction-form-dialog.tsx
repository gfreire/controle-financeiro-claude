"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, Textarea, FieldError } from "@/components/ui/input";
import { CategorySelect, SubcategorySelect } from "@/features/categories/components/category-select";
import { Plus } from "lucide-react";
import { createTransactionAction } from "../actions";
import { transactionSchema, type TransactionType } from "@/lib/validations/transactions";
import { todayIso } from "@/lib/utils/date";
import type { AccountDTO, CategoryDTO } from "@/types/dto";

const NONE = "NONE";

export function TransactionFormDialog({ accounts, categories: initialCategories }: { accounts: AccountDTO[]; categories: CategoryDTO[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState(initialCategories);

  const [type, setType] = useState<TransactionType>("EXPENSE");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIso());
  const [description, setDescription] = useState("");
  const [originAccountId, setOriginAccountId] = useState(NONE);
  const [destinationAccountId, setDestinationAccountId] = useState(NONE);
  const [categoryId, setCategoryId] = useState(NONE);
  const [subcategoryId, setSubcategoryId] = useState(NONE);

  const liquidAccounts = accounts.filter((a) => a.type !== "CREDIT_CARD");
  const relevantCategories = useMemo(() => categories.filter((c) => c.type === type), [categories, type]);
  const selectedCategory = relevantCategories.find((c) => c.id === categoryId);

  function reset() {
    setAmount(""); setDescription(""); setOriginAccountId(NONE); setDestinationAccountId(NONE); setCategoryId(NONE); setSubcategoryId(NONE);
  }

  function handleSubmit() {
    setError(null);
    const parsed = transactionSchema.safeParse({
      type,
      amount: Number(amount),
      date,
      description: description || undefined,
      originAccountId: originAccountId === NONE ? undefined : originAccountId,
      destinationAccountId: destinationAccountId === NONE ? undefined : destinationAccountId,
      categoryId: type === "INCOME" || type === "EXPENSE" ? (categoryId === NONE ? undefined : categoryId) : undefined,
      subcategoryId: type === "EXPENSE" ? (subcategoryId === NONE ? undefined : subcategoryId) : undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    startTransition(async () => {
      try {
        await createTransactionAction(parsed.data);
        router.refresh();
        setOpen(false);
        reset();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao salvar lançamento");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="size-3.5" strokeWidth={1.5} /> Novo lançamento</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Novo lançamento</DialogTitle>

        <Field>
          <Label>Tipo</Label>
          <Select value={type} onValueChange={(v) => { setType(v as TransactionType); setCategoryId(NONE); setSubcategoryId(NONE); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="EXPENSE">Despesa</SelectItem>
              <SelectItem value="INCOME">Receita</SelectItem>
              <SelectItem value="TRANSFER">Transferência</SelectItem>
            </SelectContent>
          </Select>
          <p className="mt-1 text-[11px] opacity-50">Pagar fatura de cartão fica na tela de Cartões, pra não duplicar o fluxo.</p>
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field>
            <Label>Valor</Label>
            <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field>
            <Label>Data</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>

        {(type === "EXPENSE" || type === "TRANSFER") && (
          <Field>
            <Label>Conta de origem</Label>
            <Select value={originAccountId} onValueChange={setOriginAccountId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {liquidAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        )}

        {(type === "INCOME" || type === "TRANSFER") && (
          <Field>
            <Label>Conta de destino</Label>
            <Select value={destinationAccountId} onValueChange={setDestinationAccountId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {liquidAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        )}

        {(type === "INCOME" || type === "EXPENSE") && (
          <Field>
            <Label>Categoria</Label>
            <CategorySelect
              categories={categories}
              type={type}
              value={categoryId}
              onChange={(v) => { setCategoryId(v); setSubcategoryId(NONE); }}
              onCategoryCreated={(created) => setCategories((prev) => [...prev, created])}
              noneValue={NONE}
              noneLabel="Sem categoria"
            />
          </Field>
        )}

        {type === "EXPENSE" && selectedCategory && (
          <Field>
            <Label>Subcategoria</Label>
            <SubcategorySelect
              subcategories={selectedCategory.subcategories}
              categoryId={selectedCategory.id}
              value={subcategoryId}
              onChange={setSubcategoryId}
              onSubcategoryCreated={(created) =>
                setCategories((prev) => prev.map((c) => (c.id === selectedCategory.id ? { ...c, subcategories: [...c.subcategories, created] } : c)))
              }
              noneValue={NONE}
              noneLabel="Sem subcategoria"
            />
          </Field>
        )}

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
