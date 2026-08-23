"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { AccountSelect } from "@/components/ui/account-select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, FieldError } from "@/components/ui/input";
import { CategorySelect } from "@/features/categories/components/category-select";
import { addDebtTransactionAction, updateDebtTransactionAction } from "../actions";
import { debtTransactionSchema, updateDebtTransactionSchema } from "@/lib/validations/debts";
import { todayIso } from "@/lib/utils/date";
import { formatCurrency } from "@/lib/utils/currency";
import { addMoney } from "@/lib/utils/money";
import type { AccountDTO, CategoryDTO, DebtTransactionDTO } from "@/types/dto";
import type { DebtSide } from "@/types/database";

const NONE = "NONE";

export function DebtTransactionDialog({
  debtId,
  debtName,
  debtSide,
  currentBalance,
  mode,
  accounts,
  categories: initialCategories,
  defaultCategoryId,
  entry,
  trigger,
}: {
  debtId: string;
  debtName: string;
  debtSide: DebtSide;
  /** The debt's real remaining balance, BEFORE this dialog's own effect (in edit mode, `entry`'s
   * current contribution is backed out before projecting the new one — see baselineBalance). */
  currentBalance: number;
  /** Must match `entry`'s own sign when editing — a payment (negative) never becomes an increase. */
  mode: "increase" | "payment";
  accounts: AccountDTO[];
  categories: CategoryDTO[];
  /** Only meaningful for mode="payment" — see debt-form-dialog.tsx. */
  defaultCategoryId?: string;
  /** Present → edit mode: prefills from this ledger entry and saves via updateDebtTransactionAction. */
  entry?: DebtTransactionDTO;
  trigger: React.ReactNode;
}) {
  const isEdit = !!entry;
  const isLinked = !!entry?.linkedTransactionId;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(entry?.date ?? todayIso());
  const [amount, setAmount] = useState(entry ? String(Math.abs(entry.amount)) : "");
  const [description, setDescription] = useState(entry?.description ?? `Movimentação da dívida ${debtName}`);
  const [createLinkedTransaction, setCreateLinkedTransaction] = useState(true);
  const [linkedAccountId, setLinkedAccountId] = useState(accounts[0]?.id ?? "");
  const [categories, setCategories] = useState(initialCategories);
  const [categoryId, setCategoryId] = useState(entry?.categoryId ?? (mode === "payment" && defaultCategoryId ? defaultCategoryId : NONE));
  const [confirmingSettle, setConfirmingSettle] = useState(false);

  // See category-form-dialog.tsx for why this is needed and why it's a render-phase adjustment,
  // not an Effect: the dialog stays mounted across parent re-renders, so the useState
  // initializers above never see a fresher `entry` prop on their own.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setCategories(initialCategories);
      setDate(entry?.date ?? todayIso());
      setAmount(entry ? String(Math.abs(entry.amount)) : "");
      setDescription(entry?.description ?? `Movimentação da dívida ${debtName}`);
      setCategoryId(entry?.categoryId ?? (mode === "payment" && defaultCategoryId ? defaultCategoryId : NONE));
      setConfirmingSettle(false);
    }
  }

  const numericAmount = Number(amount);
  const signedAmount = mode === "payment" ? -Math.abs(numericAmount) : Math.abs(numericAmount);
  // Editing backs out this entry's own current contribution before projecting the new balance —
  // otherwise it'd be double-counted (currentBalance already includes the un-edited entry).
  const baselineBalance = isEdit ? addMoney(currentBalance, -entry!.amount) : currentBalance;
  const projectedBalance = Number.isFinite(numericAmount) && amount ? addMoney(baselineBalance, signedAmount) : currentBalance;
  const willSettle = mode === "payment" && amount !== "" && projectedBalance <= 0;
  const isOverpayment = willSettle && projectedBalance < 0;
  // A payment always moves money the same direction as the debt's own default category was set
  // up for (see debt-form-dialog.tsx); "increase" is always the opposite type.
  const isReduction = mode === "payment";
  const categoryType = (debtSide === "PAYABLE") === isReduction ? "EXPENSE" : "INCOME";
  const showLinkedFields = isEdit ? isLinked : createLinkedTransaction;

  function resetAndClose() {
    setOpen(false);
    setAmount(entry ? String(Math.abs(entry.amount)) : "");
    setDescription(entry?.description ?? `Movimentação da dívida ${debtName}`);
    setCategoryId(entry?.categoryId ?? (mode === "payment" && defaultCategoryId ? defaultCategoryId : NONE));
    setConfirmingSettle(false);
  }

  function handleSubmit() {
    setError(null);

    // Paying off (or overpaying) a debt fully settles it — see AI_CONTEXT.md "Dívidas": the
    // debt gets soft-deleted server-side once its balance reaches zero, so we warn before
    // submitting instead of surprising the user when it silently disappears from the list.
    if (willSettle && !confirmingSettle) {
      setConfirmingSettle(true);
      return;
    }

    if (isEdit) {
      const parsed = updateDebtTransactionSchema.safeParse({
        id: entry!.id,
        date,
        amount: signedAmount,
        description: description || undefined,
        categoryId: isLinked ? (categoryId === NONE ? null : categoryId) : undefined,
      });
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "Dados inválidos");
        return;
      }
      startTransition(async () => {
        try {
          await updateDebtTransactionAction(parsed.data);
          router.refresh();
          setOpen(false);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Erro ao editar lançamento");
        }
      });
      return;
    }

    const parsed = debtTransactionSchema.safeParse({
      debtId,
      date,
      amount: signedAmount,
      description: description || undefined,
      createLinkedTransaction,
      linkedAccountId: createLinkedTransaction ? linkedAccountId : undefined,
      categoryId: createLinkedTransaction && categoryId !== NONE ? categoryId : undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    startTransition(async () => {
      try {
        await addDebtTransactionAction(parsed.data);
        router.refresh();
        resetAndClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao lançar");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) resetAndClose(); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle>
          {isEdit
            ? mode === "payment" ? "Editar pagamento" : "Editar novo valor"
            : mode === "payment" ? "Registrar pagamento" : "Registrar novo valor"}
        </DialogTitle>
        <div className="grid grid-cols-2 gap-2">
          <Field>
            <Label>Valor</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setConfirmingSettle(false); }}
            />
          </Field>
          <Field>
            <Label>Data</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field>
          <Label>Descrição</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        {!isEdit && (
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={createLinkedTransaction} onCheckedChange={setCreateLinkedTransaction} />
            Dinheiro passou por uma conta rastreada
          </label>
        )}
        {!isEdit && createLinkedTransaction && (
          <Field>
            <Label>Conta</Label>
            <AccountSelect accounts={accounts} value={linkedAccountId} onChange={setLinkedAccountId} />
          </Field>
        )}
        {showLinkedFields && (
          <Field>
            <Label>Categoria</Label>
            <CategorySelect
              categories={categories}
              type={categoryType}
              value={categoryId}
              onChange={setCategoryId}
              onCategoryCreated={(created) => setCategories((prev) => [...prev, created])}
              noneValue={NONE}
              noneLabel="Sem categoria"
            />
          </Field>
        )}
        {willSettle && confirmingSettle && (
          <p className="border border-warning-500 bg-warning-100 p-2 text-xs text-warning-700">
            {isOverpayment
              ? `Você está pagando ${formatCurrency(Math.abs(projectedBalance))} a mais que o saldo devido (${formatCurrency(currentBalance)}) — pode ser juros ou um acerto intencional. Confirmando, o pagamento é registrado e a dívida com ${debtName} é quitada e sai da listagem.`
              : `Este pagamento quita a dívida com ${debtName} — ela será marcada como quitada e removida da listagem.`}
          </p>
        )}
        <FieldError>{error}</FieldError>
        <DialogActions>
          <DialogClose asChild><Button variant="secondary" size="sm">Cancelar</Button></DialogClose>
          <Button size="sm" disabled={pending || !amount} onClick={handleSubmit}>
            {pending ? "Salvando..." : willSettle && confirmingSettle ? "Confirmar quitação" : isEdit ? "Salvar" : "Confirmar"}
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
