"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, FieldError } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { CategorySelect, SubcategorySelect } from "@/features/categories/components/category-select";
import { Plus, TriangleAlert } from "lucide-react";
import { createCardPurchaseAction, updateCardPurchaseAction } from "../actions";
import { cardPurchaseSchema } from "@/lib/validations/cards";
import { splitInstallments, sumMoney, subtractMoney, addMoney } from "@/lib/utils/money";
import { calculateInstallmentCompetences, calculateInstallmentCompetencesFromAnchorMonth, monthKey, todayIso } from "@/lib/utils/date";
import { formatCurrency } from "@/lib/utils/currency";
import type { AccountDTO, CardPurchaseDTO, CategoryDTO } from "@/types/dto";

const NONE = "NONE";

// Sum of whichever installments (a contiguous prefix, per resolvePaidBeforeSystemFlags in
// cards.service.ts) would NOT be flagged paid_before_system — the portion that actually
// counts against the credit limit, mirroring getCardTotalCommitted's own exclusion.
function nonPaidAmount(
  totalAmount: number,
  count: number,
  firstCompetenceMonth: string,
  paidThroughCompetence: string | undefined | null,
  dueDay: number | undefined
): number {
  if (!paidThroughCompetence || !dueDay || count < 1) return totalAmount;
  const competences = calculateInstallmentCompetencesFromAnchorMonth(firstCompetenceMonth, dueDay, count);
  const paidCount = competences.filter((c) => monthKey(c) <= paidThroughCompetence).length;
  if (paidCount === 0) return totalAmount;
  const split = splitInstallments(totalAmount, count);
  return subtractMoney(totalAmount, sumMoney(split.slice(0, paidCount)));
}

export function PurchaseFormDialog({
  cards,
  cardTotals,
  categories: initialCategories,
  purchase,
  trigger,
}: {
  cards: AccountDTO[];
  // cardId -> getCardTotalCommitted(cardId) — already excludes paid_before_system installments
  // and payments, unlike AccountDTO.balance (raw card_installments/card_payments sum, includes
  // paid-before-system rows). Used for the soft over-limit warning below.
  cardTotals: Record<string, number>;
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
  const [isBackfill, setIsBackfill] = useState(!!purchase?.paidThroughCompetence);
  const [paidThroughCompetence, setPaidThroughCompetence] = useState(purchase?.paidThroughCompetence ?? "");

  const expenseCategories = categories.filter((c) => c.type === "EXPENSE");
  const selectedCategory = expenseCategories.find((c) => c.id === categoryId);
  const selectedCard = cards.find((c) => c.id === creditCardId);

  const preview = useMemo(() => {
    const value = Number(amount);
    const count = Number(installments);
    if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(count) || count < 1) return null;
    return splitInstallments(value, count);
  }, [amount, installments]);

  // Mirrors resolveCompetences in cards.service.ts — this form always sends firstCompetenceMonth,
  // so the server always takes the anchor-month path, never the purchaseDate-derived one.
  const competencesPreview = useMemo(() => {
    const count = Number(installments);
    if (!selectedCard?.dueDay || !Number.isFinite(count) || count < 1) return null;
    return calculateInstallmentCompetencesFromAnchorMonth(firstCompetenceMonth, selectedCard.dueDay, count);
  }, [firstCompetenceMonth, installments, selectedCard]);

  const paidInstallmentsCount = useMemo(() => {
    if (!isBackfill || !paidThroughCompetence || !competencesPreview) return 0;
    return competencesPreview.filter((c) => monthKey(c) <= paidThroughCompetence).length;
  }, [isBackfill, paidThroughCompetence, competencesPreview]);

  const paidThroughInFuture = isBackfill && !!paidThroughCompetence && paidThroughCompetence > monthKey(todayIso());

  // The existing purchase's own contribution to cardTotals, BEFORE this edit — i.e. only the
  // portion of its original installments that weren't paid_before_system, since that's what's
  // actually still counted in cardTotals[creditCardId] right now.
  const existingNonPaidAmount = useMemo(() => {
    if (!isEdit || !purchase || !selectedCard?.dueDay) return 0;
    return nonPaidAmount(purchase.totalAmount, purchase.installmentsCount, purchase.firstCompetenceMonth, purchase.paidThroughCompetence, selectedCard.dueDay);
  }, [isEdit, purchase, selectedCard]);

  // Soft-enforced (never blocks the insert) — a real invoice payment not yet logged, or a
  // genuine mistake in this purchase, are both things the user should see and decide about.
  // Mirrors getCardTotalCommitted: only the non-paid-before-system portion of this purchase
  // (new or edited) counts against the limit — a backfilled installment was already settled
  // outside the system, so it shouldn't trip a "you're over the limit" warning.
  const overLimitInfo = useMemo(() => {
    const value = Number(amount);
    if (!selectedCard?.creditLimit || !Number.isFinite(value) || value <= 0) return null;
    const currentDebt = cardTotals[selectedCard.id] ?? 0;
    const debtExcludingThisPurchase = isEdit ? Math.max(0, subtractMoney(currentDebt, existingNonPaidAmount)) : currentDebt;
    const newNonPaidAmount = nonPaidAmount(value, Number(installments), firstCompetenceMonth, isBackfill ? paidThroughCompetence : null, selectedCard.dueDay);
    const projected = addMoney(debtExcludingThisPurchase, newNonPaidAmount);
    if (projected <= selectedCard.creditLimit) return null;
    return { projected, limit: selectedCard.creditLimit };
  }, [amount, selectedCard, isEdit, cardTotals, existingNonPaidAmount, installments, firstCompetenceMonth, isBackfill, paidThroughCompetence]);

  function suggestCompetence(nextDate: string, cardId: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) return; // incomplete date while typing (e.g. "2026-08-")
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
    setIsBackfill(false);
    setPaidThroughCompetence("");
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
    if (paidThroughInFuture) {
      setError("'Pago até' não pode ser um mês futuro.");
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
      // Explicit null (not undefined) when unchecked, so updateCardPurchase's `!== undefined`
      // merge check treats unchecking an existing backfill as a real clear, not "not provided".
      paidThroughCompetence: isBackfill && paidThroughCompetence ? paidThroughCompetence : null,
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
            <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => handleAmountChange(e.target.value)} />
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
          <label className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={isBackfill}
              onCheckedChange={(v) => { setIsBackfill(v === true); if (v !== true) setPaidThroughCompetence(""); }}
            />
            Compra antiga — já paguei parte das parcelas antes de usar o sistema
          </label>
        </Field>

        {isBackfill && (
          <Field>
            <Label>Pago até (mês)</Label>
            <Input
              type="month"
              value={paidThroughCompetence}
              max={monthKey(todayIso())}
              onChange={(e) => setPaidThroughCompetence(e.target.value)}
            />
            {paidThroughInFuture && (
              <p className="text-xs text-danger-600">&quot;Pago até&quot; não pode ser um mês futuro.</p>
            )}
            {!paidThroughInFuture && paidInstallmentsCount > 0 && competencesPreview && (
              <p className="text-xs opacity-70">
                {paidInstallmentsCount} de {competencesPreview.length} parcelas já pagas antes do sistema — não entram na fatura, mas contam nos gastos por categoria.
              </p>
            )}
          </Field>
        )}

        <Field>
          <Label>Categoria</Label>
          <CategorySelect
            categories={categories}
            type="EXPENSE"
            value={categoryId}
            onChange={(v) => { setCategoryId(v); setSubcategoryId(NONE); }}
            onCategoryCreated={(created) => setCategories((prev) => [...prev, created])}
            noneValue={NONE}
            noneLabel="Sem categoria"
          />
        </Field>

        {selectedCategory && (
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
            disabled={pending || !amount || creditCardId === NONE || !selectedCard || (!!overLimitInfo && !overLimitAcknowledged) || paidThroughInFuture}
            onClick={handleSubmit}
          >
            {pending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
