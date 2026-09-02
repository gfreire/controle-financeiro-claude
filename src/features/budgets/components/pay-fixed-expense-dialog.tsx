"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { AccountSelect, AccountBalanceHint } from "@/components/ui/account-select";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, FieldError } from "@/components/ui/input";
import { payFixedExpenseAction, cancelFixedExpensePaymentAction, getUnlinkedExpenseCandidatesAction, linkExistingTransactionAction } from "../actions";
import { todayIso, formatDate } from "@/lib/utils/date";
import { formatCurrency } from "@/lib/utils/currency";
import { textIncludes } from "@/lib/utils/normalize";
import type { AccountDTO, FixedExpenseDTO } from "@/types/dto";

export function PayFixedExpenseDialog({ expense, accounts, month, trigger }: { expense: FixedExpenseDTO; accounts: AccountDTO[]; month: string; trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState(expense.defaultAccountId ?? accounts[0]?.id ?? "");
  const [amount, setAmount] = useState(String(expense.plannedAmount));
  const [date, setDate] = useState(todayIso());
  const selectedAccount = accounts.find((a) => a.id === accountId);
  const isCreditCard = selectedAccount?.type === "CREDIT_CARD";

  // "Vincular lançamento existente" (AI_CONTEXT.md "Despesas fixas — vincular pagamento já
  // lançado") — pro caso de recriar uma despesa fixa apagada por engano sem perder o rastro de um
  // pagamento manual já registrado. Candidatas são buscadas sob demanda (só quando o modo abre),
  // não pré-carregadas — mesmo padrão de leitura via Server Action já usado por getBudgetFloorAction.
  const [mode, setMode] = useState<"new" | "link">("new");
  const [candidates, setCandidates] = useState<{ id: string; date: string; description: string; amount: number; source: "transaction" | "purchase" }[] | null>(null);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);

  // See category-form-dialog.tsx for why this is needed and why it's a render-phase adjustment,
  // not an Effect: the dialog stays mounted across parent re-renders, so the useState
  // initializers above never see a fresher `expense.plannedAmount`/`defaultAccountId` (e.g.
  // edited via the fixed-expense form while this dialog was closed).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setAccountId(expense.defaultAccountId ?? accounts[0]?.id ?? "");
      setAmount(String(expense.plannedAmount));
      setDate(todayIso());
      setMode("new");
      setCandidates(null);
      setSearch("");
      setSelectedTransactionId(null);
    }
  }

  function openLinkMode() {
    setMode("link");
    if (candidates === null) {
      setLoadingCandidates(true);
      getUnlinkedExpenseCandidatesAction(expense.categoryId || null)
        .then(setCandidates)
        .finally(() => setLoadingCandidates(false));
    }
  }

  function handleLinkConfirm() {
    const selected = (candidates ?? []).find((c) => c.id === selectedTransactionId);
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      try {
        await linkExistingTransactionAction(expense.id, selected.id, selected.source);
        router.refresh();
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao vincular lançamento");
      }
    });
  }

  const filteredCandidates = (candidates ?? []).filter((c) => !search || textIncludes(c.description, search));

  function handleSubmit() {
    setError(null);
    const value = Number(amount);
    if (!accountId || !Number.isFinite(value) || value <= 0) {
      setError("Preencha conta e valor corretamente");
      return;
    }
    startTransition(async () => {
      try {
        await payFixedExpenseAction({
          fixedExpenseId: expense.id,
          originAccountId: accountId,
          amount: value,
          date,
          description: `Pagamento — ${expense.name}`,
          categoryId: expense.categoryId,
          subcategoryId: expense.subcategoryId,
        });
        router.refresh();
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao registrar pagamento");
      }
    });
  }

  function handleCancelPayment() {
    setError(null);
    startTransition(async () => {
      try {
        await cancelFixedExpensePaymentAction(expense.id, month);
        router.refresh();
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao cancelar pagamento");
      }
    });
  }

  if (expense.isPaidThisMonth) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent>
          <DialogTitle>Pagamento — {expense.name}</DialogTitle>
          <p className="text-sm">
            {expense.name} pago no valor de {formatCurrency(expense.actualAmount)}
            {expense.paidDate ? ` no dia ${formatDate(expense.paidDate)}` : ""}.
          </p>
          <FieldError>{error}</FieldError>
          <DialogActions>
            <Button variant="danger" size="sm" disabled={pending} onClick={handleCancelPayment}>
              {pending ? "Cancelando..." : "Cancelar pagamento"}
            </Button>
            <DialogClose asChild><Button size="sm">OK</Button></DialogClose>
          </DialogActions>
        </DialogContent>
      </Dialog>
    );
  }

  if (mode === "link") {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent>
          <DialogTitle>Vincular lançamento existente — {expense.name}</DialogTitle>
          <p className="text-xs opacity-70">
            Pra quando esse pagamento já foi lançado manualmente antes (ex: a despesa programada foi recriada depois de apagada por engano). Mostra despesas ainda sem despesa programada vinculada, priorizando a mesma categoria.
          </p>
          <Field>
            <Label>Buscar por descrição</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." />
          </Field>
          {loadingCandidates ? (
            <p className="text-sm opacity-60">Carregando...</p>
          ) : filteredCandidates.length === 0 ? (
            <p className="text-sm opacity-60">Nenhum lançamento sem vínculo encontrado.</p>
          ) : (
            <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
              {filteredCandidates.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedTransactionId(c.id)}
                    className={`flex w-full items-center justify-between gap-2 border p-2 text-left text-sm ${
                      selectedTransactionId === c.id ? "border-accent bg-accent-100" : "border-divider hover:border-text/45"
                    }`}
                  >
                    <span className="truncate">{formatDate(c.date)} · {c.description || "Sem descrição"}</span>
                    <span className="shrink-0 tabular-nums">{formatCurrency(c.amount)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <FieldError>{error}</FieldError>
          <DialogActions>
            <Button variant="secondary" size="sm" onClick={() => setMode("new")}>Voltar</Button>
            <Button size="sm" disabled={pending || !selectedTransactionId} onClick={handleLinkConfirm}>
              {pending ? "Vinculando..." : "Vincular"}
            </Button>
          </DialogActions>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle>Registrar pagamento — {expense.name}</DialogTitle>
        <Field>
          <Label>Conta</Label>
          <AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} />
          <AccountBalanceHint accounts={accounts} accountId={accountId} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field>
            <Label>Valor</Label>
            <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field>
            <Label>{isCreditCard ? "Data da compra" : "Data"}</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        {isCreditCard && (
          <p className="-mt-1 text-[11px] opacity-50">
            Lançado como uma compra de 1x no cartão — a competência segue o fechamento da fatura (pode cair no mês seguinte).
          </p>
        )}
        <FieldError>{error}</FieldError>
        <DialogActions>
          <button type="button" className="mr-auto text-xs text-accent underline underline-offset-2" onClick={openLinkMode}>
            Já lancei isso manualmente
          </button>
          <DialogClose asChild><Button variant="secondary" size="sm">Cancelar</Button></DialogClose>
          <Button size="sm" disabled={pending} onClick={handleSubmit}>{pending ? "Salvando..." : "Confirmar"}</Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
