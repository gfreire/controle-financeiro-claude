"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, Textarea, FieldError } from "@/components/ui/input";
import { CategorySelect, SubcategorySelect } from "@/features/categories/components/category-select";
import { AccountSelect, AccountBalanceHint } from "@/components/ui/account-select";
import { Plus, Pencil } from "lucide-react";
import { BalanceAdjustForm } from "@/features/accounts/components/balance-adjust-dialog";
import { InterestForm } from "@/features/accounts/components/interest-dialog";
import { createTransactionAction, updateTransactionAction } from "../actions";
import { transactionSchema, type TransactionType } from "@/lib/validations/transactions";
import { todayIso } from "@/lib/utils/date";
import type { AccountDTO, CategoryDTO, TransactionViewDTO } from "@/types/dto";

const NONE = "NONE";

type MovementKind = "TRANSACTION" | "YIELD" | "INTEREST" | "RECONCILE";

const KIND_LABEL: Record<MovementKind, string> = {
  TRANSACTION: "Movimentação",
  YIELD: "Informar Rendimento",
  INTEREST: "Lançar Juros",
  RECONCILE: "Ajustar Saldo",
};

export function TransactionFormDialog({
  accounts,
  categories: initialCategories,
  transaction,
}: {
  accounts: AccountDTO[];
  categories: CategoryDTO[];
  /** When set, the dialog edits this transaction instead of creating a new one — trigger becomes a pencil icon on the row. */
  transaction?: TransactionViewDTO;
}) {
  const isEdit = !!transaction;
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<MovementKind>("TRANSACTION");
  const [accountId, setAccountId] = useState("");
  const close = () => setOpen(false);

  // Accounts each shortcut accepts — the same rule as the account card's menu: "Informar
  // Rendimento"/"Lançar Juros" are BANK-only, "Ajustar Saldo" is CASH + BANK.
  const kindAccounts = kind === "RECONCILE" ? accounts.filter((a) => a.type === "CASH" || a.type === "BANK") : accounts.filter((a) => a.type === "BANK");
  const selectedAccount = kindAccounts.find((a) => a.id === accountId);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setKind("TRANSACTION");
  }

  function handleKindChange(next: MovementKind) {
    setKind(next);
    const eligible = next === "RECONCILE" ? accounts.filter((a) => a.type === "CASH" || a.type === "BANK") : accounts.filter((a) => a.type === "BANK");
    setAccountId(eligible[0]?.id ?? "");
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {isEdit ? (
          // Real padding, no negative margin — see delete-transaction-button.tsx for why: this
          // sits alongside estornar/excluir, and an expanded-but-overlapping hit zone would let
          // taps meant for this button land on a more destructive neighbor instead.
          <button className="p-2.5 text-text/40 hover:text-accent" aria-label="Editar lançamento">
            <Pencil className="size-3.5" strokeWidth={1.5} />
          </button>
        ) : (
          <Button size="sm"><Plus className="size-3.5" strokeWidth={1.5} /> Nova movimentação</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{isEdit ? "Editar movimentação" : "Nova movimentação"}</DialogTitle>

        {!isEdit && (
          <Field>
            <Label>Tipo de movimentação</Label>
            <Select value={kind} onValueChange={(v) => handleKindChange(v as MovementKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(KIND_LABEL) as MovementKind[]).map((k) => <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        )}

        {kind !== "TRANSACTION" && (
          <Field>
            <Label>Conta</Label>
            <AccountSelect accounts={kindAccounts} value={accountId} onChange={setAccountId} />
            {kindAccounts.length === 0 && <p className="mt-1 text-[11px] opacity-50">Nenhuma conta elegível.</p>}
          </Field>
        )}

        {kind === "TRANSACTION" && <TransactionForm accounts={accounts} categories={initialCategories} transaction={transaction} onDone={close} />}
        {/* key remounts the form on an account switch, so its state follows the newly picked account. */}
        {kind === "YIELD" && selectedAccount && <BalanceAdjustForm key={selectedAccount.id} account={selectedAccount} mode="yield" onDone={close} />}
        {kind === "INTEREST" && selectedAccount && <InterestForm key={selectedAccount.id} account={selectedAccount} onDone={close} />}
        {kind === "RECONCILE" && selectedAccount && <BalanceAdjustForm key={selectedAccount.id} account={selectedAccount} mode="reconcile" onDone={close} />}
      </DialogContent>
    </Dialog>
  );
}

/** The plain INCOME/EXPENSE/TRANSFER form. Radix unmounts the dialog content on close, so state
 * starts fresh (from `transaction`, in edit mode) on every open. */
function TransactionForm({
  accounts,
  categories: initialCategories,
  transaction,
  onDone,
}: {
  accounts: AccountDTO[];
  categories: CategoryDTO[];
  transaction?: TransactionViewDTO;
  onDone: () => void;
}) {
  const isEdit = !!transaction;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState(initialCategories);

  const [type, setType] = useState<TransactionType>((transaction?.type as TransactionType) ?? "EXPENSE");
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : "");
  const [date, setDate] = useState(transaction?.date ?? todayIso());
  const [description, setDescription] = useState(transaction?.description ?? "");
  const [originAccountId, setOriginAccountId] = useState(transaction?.originAccountId ?? NONE);
  const [destinationAccountId, setDestinationAccountId] = useState(transaction?.destinationAccountId ?? NONE);
  const [categoryId, setCategoryId] = useState(transaction?.categoryId ?? NONE);
  const [subcategoryId, setSubcategoryId] = useState(transaction?.subcategoryId ?? NONE);


  const liquidAccounts = accounts.filter((a) => a.type !== "CREDIT_CARD");
  const relevantCategories = useMemo(() => categories.filter((c) => c.type === type), [categories, type]);
  const selectedCategory = relevantCategories.find((c) => c.id === categoryId);


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
        if (isEdit) {
          await updateTransactionAction({ id: transaction.id, ...parsed.data });
        } else {
          await createTransactionAction(parsed.data);
        }
        router.refresh();
        onDone();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao salvar lançamento");
      }
    });
  }

  return (
    <>
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
            <AccountSelect accounts={liquidAccounts} value={originAccountId} onChange={setOriginAccountId} />
            <AccountBalanceHint accounts={liquidAccounts} accountId={originAccountId} />
          </Field>
        )}

        {(type === "INCOME" || type === "TRANSFER") && (
          <Field>
            <Label>Conta de destino</Label>
            <AccountSelect accounts={liquidAccounts} value={destinationAccountId} onChange={setDestinationAccountId} />
            <AccountBalanceHint accounts={liquidAccounts} accountId={destinationAccountId} />
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
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder={type === "TRANSFER" ? "Transferência entre contas" : undefined}
          />
        </Field>

        <FieldError>{error}</FieldError>
        <DialogActions>
          <DialogClose asChild><Button variant="secondary" size="sm">Cancelar</Button></DialogClose>
          <Button size="sm" disabled={pending || !amount} onClick={handleSubmit}>{pending ? "Salvando..." : "Salvar"}</Button>
        </DialogActions>
    </>
  );
}
