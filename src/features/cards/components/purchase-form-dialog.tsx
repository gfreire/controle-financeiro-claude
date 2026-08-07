"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, FieldError } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { InlineCategoryCreate, InlineSubcategoryCreate } from "@/features/categories/components/inline-category-create";
import { Plus, TriangleAlert } from "lucide-react";
import { createCardPurchaseAction, updateCardPurchaseAction } from "../actions";
import { cardPurchaseSchema } from "@/lib/validations/cards";
import { splitInstallments } from "@/lib/utils/money";
import { calculateInstallmentCompetences, monthKey, todayIso } from "@/lib/utils/date";
import { formatCurrency } from "@/lib/utils/currency";
import type { AccountDTO, CardPurchaseDTO, CategoryDTO } from "@/types/dto";

const NONE = "NONE";

export function PurchaseFormDialog({
  cards,
  categories: initialCategories,
  purchase,
  trigger,
}: {
  cards: AccountDTO[];
  categories: CategoryDTO[];
  purchase?: CardPurchaseDTO;
  trigger?: React.ReactNode;
}) {
  const isEdit = !!purchase;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState(initialCategories);

  const [creditCardId, setCreditCardId] = useState(purchase?.creditCardId ?? cards[0]?.id ?? NONE);
  const [amount, setAmount] = useState(purchase ? String(purchase.totalAmount) : "");
  const [purchaseDate, setPurchaseDate] = useState(purchase?.purchaseDate ?? todayIso());
  const [description, setDescription] = useState(purchase?.description ?? "");
  const [installments, setInstallments] = useState(purchase ? String(purchase.installmentsCount) : "1");
  const [categoryId, setCategoryId] = useState(purchase?.categoryId ?? NONE);
  const [subcategoryId, setSubcategoryId] = useState(purchase?.subcategoryId ?? NONE);
  const [firstCompetenceMonth, setFirstCompetenceMonth] = useState(purchase?.firstCompetenceMonth ?? monthKey(todayIso()));
  const [competenceManuallyEdited, setCompetenceManuallyEdited] = useState(false);
  const [overLimitAcknowledged, setOverLimitAcknowledged] = useState(false);

  const expenseCategories = categories.filter((c) => c.type === "EXPENSE");
  const selectedCategory = expenseCategories.find((c) => c.id === categoryId);
  const selectedCard = cards.find((c) => c.id === creditCardId);

  const preview = useMemo(() => {
    const value = Number(amount);
    const count = Number(installments);
    if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(count) || count < 1) return null;
    return splitInstallments(value, count);
  }, [amount, installments]);

  // Soft-enforced (never blocks the insert) — a real invoice payment not yet logged, or a
  // genuine mistake in this purchase, are both things the user should see and decide about.
  const overLimitInfo = useMemo(() => {
    const value = Number(amount);
    if (!selectedCard?.creditLimit || !Number.isFinite(value) || value <= 0) return null;
    const currentDebt = Math.max(0, -selectedCard.balance);
    const debtExcludingThisPurchase = isEdit && purchase ? Math.max(0, currentDebt - purchase.totalAmount) : currentDebt;
    const projected = debtExcludingThisPurchase + value;
    if (projected <= selectedCard.creditLimit) return null;
    return { projected, limit: selectedCard.creditLimit };
  }, [amount, selectedCard, isEdit, purchase]);

  function suggestCompetence(nextDate: string, cardId: string) {
    const card = cards.find((c) => c.id === cardId);
    if (!card?.closingDay || !card.dueDay) return;
    const suggested = monthKey(calculateInstallmentCompetences(nextDate, card.closingDay, card.dueDay, 1)[0]);
    setFirstCompetenceMonth(suggested);
  }

  function handleDateChange(value: string) {
    setPurchaseDate(value);
    if (!competenceManuallyEdited) suggestCompetence(value, creditCardId);
  }

  function handleCardChange(value: string) {
    setCreditCardId(value);
    if (!competenceManuallyEdited) suggestCompetence(purchaseDate, value);
  }

  function resetForm() {
    setAmount(""); setDescription(""); setInstallments("1"); setCategoryId(NONE); setSubcategoryId(NONE);
    setCompetenceManuallyEdited(false);
    setFirstCompetenceMonth(monthKey(todayIso()));
    setOverLimitAcknowledged(false);
  }

  function handleAmountChange(value: string) {
    setAmount(value);
    setOverLimitAcknowledged(false);
  }

  function handleSubmit() {
    setError(null);
    if (overLimitInfo && !overLimitAcknowledged) {
      setError("Confirme que quer inserir mesmo assim (marque a caixa acima).");
      return;
    }
    const parsed = cardPurchaseSchema.safeParse({
      creditCardId,
      amount: Number(amount),
      purchaseDate,
      description: description || undefined,
      categoryId: categoryId === NONE ? undefined : categoryId,
      subcategoryId: subcategoryId === NONE ? undefined : subcategoryId,
      installments: Number(installments),
      firstCompetenceMonth,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    startTransition(async () => {
      try {
        if (isEdit) {
          await updateCardPurchaseAction(purchase.id, parsed.data);
        } else {
          await createCardPurchaseAction(parsed.data);
        }
        router.refresh();
        setOpen(false);
        if (!isEdit) resetForm();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao salvar compra");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button size="sm" disabled={cards.length === 0}><Plus className="size-3.5" strokeWidth={1.5} /> Nova compra</Button>}
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{isEdit ? "Editar compra" : "Nova compra no cartão"}</DialogTitle>
        {isEdit && (
          <p className="text-xs opacity-60">Editar refaz o parcelamento inteiro a partir dos novos valores — as parcelas atuais são substituídas.</p>
        )}

        <Field>
          <Label>Cartão</Label>
          <Select value={creditCardId} onValueChange={handleCardChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {cards.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field>
            <Label>Valor total</Label>
            <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => handleAmountChange(e.target.value)} />
          </Field>
          <Field>
            <Label>Data da compra</Label>
            <Input type="date" value={purchaseDate} onChange={(e) => handleDateChange(e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field>
            <Label>Parcelas</Label>
            <Input type="number" min={1} max={48} value={installments} onChange={(e) => setInstallments(e.target.value)} />
          </Field>
          <Field>
            <Label>Mês da 1ª parcela</Label>
            <Input
              type="month"
              value={firstCompetenceMonth}
              onChange={(e) => { setFirstCompetenceMonth(e.target.value); setCompetenceManuallyEdited(true); }}
            />
          </Field>
        </div>

        {preview && preview.length > 1 && (
          <p className="text-xs opacity-70">
            {preview.length}x de {formatCurrency(preview[1])} (1ª parcela {formatCurrency(preview[0])})
          </p>
        )}

        <Field>
          <div className="flex items-center justify-between">
            <Label className="mb-0">Categoria</Label>
            <InlineCategoryCreate type="EXPENSE" onCreated={(created) => { setCategories((prev) => [...prev, created]); setCategoryId(created.id); }} />
          </div>
          <Select value={categoryId} onValueChange={(v) => { setCategoryId(v); setSubcategoryId(NONE); }}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Sem categoria</SelectItem>
              {expenseCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>

        {selectedCategory && (
          <Field>
            <div className="flex items-center justify-between">
              <Label className="mb-0">Subcategoria</Label>
              <InlineSubcategoryCreate
                categoryId={selectedCategory.id}
                onCreated={(created) => {
                  setCategories((prev) => prev.map((c) => (c.id === selectedCategory.id ? { ...c, subcategories: [...c.subcategories, created] } : c)));
                  setSubcategoryId(created.id);
                }}
              />
            </div>
            <Select value={subcategoryId} onValueChange={setSubcategoryId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sem subcategoria</SelectItem>
                {selectedCategory.subcategories.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        )}

        <Field>
          <Label>Descrição</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>

        {overLimitInfo && (
          <div className="flex flex-col gap-2 border border-warning-500 bg-warning-100 p-2.5 text-warning-700">
            <p className="flex items-start gap-1.5 text-xs">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} />
              Essa compra deixaria o cartão em {formatCurrency(overLimitInfo.projected)}, acima do limite de {formatCurrency(overLimitInfo.limit)}.
              Você pode ter esquecido de registrar o pagamento da fatura, ou errado algo nesse cadastro.
            </p>
            <label className="flex items-center gap-2 text-xs">
              <Checkbox checked={overLimitAcknowledged} onCheckedChange={(v) => setOverLimitAcknowledged(v === true)} />
              Quero inserir mesmo assim
            </label>
          </div>
        )}

        <FieldError>{error}</FieldError>
        <DialogActions>
          <DialogClose asChild><Button variant="secondary" size="sm">Cancelar</Button></DialogClose>
          <Button
            size="sm"
            disabled={pending || !amount || creditCardId === NONE || !selectedCard || (!!overLimitInfo && !overLimitAcknowledged)}
            onClick={handleSubmit}
          >
            {pending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
