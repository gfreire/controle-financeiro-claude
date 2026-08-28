import type { AccountType, CategoryType, DebtSide, DebtKind, TransactionType } from "./database";

/**
 * DTOs — this file is the source of truth (DOC/ARCHITECTURE.md's "DTO Definitions" block mirrors
 * it and must be kept in sync whenever a type here changes). UI components only ever consume
 * these, never raw table rows from `database.ts`.
 */

export type DashboardFilters = {
  periodStart: string;
  periodEnd: string;
  accounts?: string[];
  categories?: string[];
  subcategories?: string[];
  transactionType?: "INCOME" | "EXPENSE";
  /** Clicking the "uncategorized" slice of a chart sets this instead of stuffing a fake id into `categories` — category_id is a uuid column, so it must be filtered with `.is(null)`, never `.in([...])`. */
  uncategorizedOnly?: boolean;
  /**
   * Account-type segmentation for the dashboard's expense breakdown charts only — "liquid" keeps
   * only `transactions` (CASH/BANK), "cards" keeps only `card_installments` (CREDIT_CARD); a plain
   * EXPENSE transaction is never posted against a CREDIT_CARD account (that flow always goes
   * through card_purchases/card_installments), so this cleanly splits fetchPeriodEntries' two
   * source queries instead of needing per-account-id filtering. Not part of the global filter bar —
   * only ever set by the page when building the expense-charts-only filters object.
   */
  source?: "all" | "liquid" | "cards";
};

export type FinancialSummaryDTO = {
  balance: number;
  income: number;
  expense: number;
  result: number;
  adjustmentAmount: number; // R$ under "Ajuste" in the period — bookkeeping-looseness signal, shown as a badge next to Balanço Mensal (was a % share until 2026-08-28; percentages read poorly on the card)
  retroactiveIncomeAmount: number; // R$ from paid-before-system installments in the period — computed, no UI consumer since 2026-08-28 (badge removed), see AI_CONTEXT.md "Compras retroativas"
  refundAmount: number; // R$ flowing through "Estorno" in the period (both directions, so ~2× a single refund) — computed, no UI consumer since 2026-08-28 (badge removed), see AI_CONTEXT.md "Estorno"
};

export type MonthlyEvolutionDTO = { month: string; income: number; expense: number };

export type CategoryDistributionDTO = {
  categoryId: string;
  categoryName: string;
  total: number;
  color: string;
  icon: string | null;
};

export type TransactionViewDTO = {
  id: string;
  date: string;
  description: string;
  type: TransactionType;
  categoryId: string | null;
  category: string;
  subcategoryId: string | null;
  subcategory: string;
  accountId: string | null;
  account: string;
  accountType: AccountType | null;
  amount: number;
  source: "transaction" | "installment";
  purchaseId?: string; // set only when source === "installment" — the category/subcategory live on card_purchases, not the installment row, so edits must target this id
  paidBeforeSystem?: boolean; // set only when source === "installment" — backfilled/retroactive purchase installment already paid outside the system, see AI_CONTEXT.md "Compras retroativas"
  originAccountId?: string | null; // set only when source === "transaction" — accountId/account above merge origin+destination for display; full edit (TransactionFormDialog edit mode) needs both sides distinguished
  destinationAccountId?: string | null; // set only when source === "transaction"
};

export type ReservoirDTO = {
  id: string; name: string; balance: number; categoryId: string | null; categoryName: string | null
  defaultPercentage?: number; defaultDestinationAccountId?: string
};

export type ReservoirTransactionDTO = {
  id: string;
  reservoirId: string;
  date: string;
  description: string | null;
  amount: number;
  grossAmount?: number;
  percentage?: number;
  linkedTransactionId?: string;
  linkedCardPurchaseId?: string;
};

export type DebtDTO = {
  id: string;
  side: DebtSide;
  agent: string;
  kind: DebtKind; // PERSONAL nunca afeta o dashboard; OVERDUE_BILL/INSTALLMENT_PLAN sempre contam em "Dívidas em aberto" — ver AI_CONTEXT.md "Dívidas — subtipos"
  originalAmount: number;
  remainingBalance: number;
  active: boolean;
  defaultCategoryId?: string; // pré-preenche (sobrescrevível) a categoria de um pagamento registrado contra a dívida
  monthlyAmount?: number; // só INSTALLMENT_PLAN — valor combinado a pagar por mês
  dueDay?: number; // só INSTALLMENT_PLAN — dia de vencimento mensal, 1-28
  paidThisMonth?: boolean; // só INSTALLMENT_PLAN — se já existe um pagamento (debt_transactions.amount < 0) datado no mês corrente
};

export type DebtTransactionDTO = {
  id: string;
  debtId: string;
  date: string;
  description: string | null;
  amount: number;
  linkedTransactionId?: string;
  categoryId?: string; // set only when linkedTransactionId is — the linked transaction's own category
};

export type CardPurchaseDTO = {
  id: string;
  creditCardId: string;
  description: string;
  totalAmount: number;
  installmentsCount: number;
  purchaseDate: string;
  firstCompetenceMonth: string; // "YYYY-MM" — the earliest installment's actual competence, for pre-filling an edit
  categoryId: string | null;
  categoryName: string | null;
  subcategoryId: string | null;
  subcategoryName: string | null;
  paidThroughCompetence?: string; // "YYYY-MM" — set for a backfilled/retroactive purchase; every generated installment with competence <= this month is flagged card_installments.paid_before_system, see AI_CONTEXT.md "Compras retroativas"
  refundedAt?: string; // set when a card_refunds row exists for this purchase — full refund only, see AI_CONTEXT.md "Estorno"
  remainingUnbilledAmount: number; // sum of this purchase's not-yet-billed installments (competence past the currently open invoice) — 0 when nothing is left
  remainingInstallmentsCount: number; // how many not-yet-billed installments remain — the max for "Antecipar parcelas"' count input
};

export type CardSummaryDTO = {
  accountId: string;
  creditLimit: number | null;
  usedThroughCurrentMonth: number; // = getCardBalanceThroughMonth(cardId, todayMonth) — installments due through TODAY's real month minus payments, floored at 0. Drives the "Pagar fatura" suggested amount; always today-anchored, independent of the page's month filter.
  currentMonthInvoice: number; // sum of card_installments.amount where competence falls in the page's VIEWED month (the month filter), not necessarily today's month
  currentMonthPaidAmount: number; // how much of currentMonthInvoice is already covered — derived (card_payments has no month of its own), oldest-competence-first, see cards.service.ts#getCardSummary. Always 0 <= this <= currentMonthInvoice.
  overdueAmount: number; // = usedThroughCurrentMonth - (today's month invoice), floored at 0 — unpaid balance from prior months, always today-anchored
  totalCommitted: number; // = getCardTotalCommitted — ALL installments ever generated (incl. future not-yet-due) minus all payments, floored at 0. The correct "used against the limit" figure.
  openInvoiceMonth: string; // "YYYY-MM" — the competence month a purchase made TODAY would land in (via calculateInstallmentCompetences + the card's closing_day/due_day), i.e. whichever invoice is still accumulating charges right now. Always today-anchored, independent of the page's month filter — same convention as usedThroughCurrentMonth/overdueAmount.
  openInvoiceAmount: number; // sum of card_installments.amount for openInvoiceMonth — does NOT exclude paid_before_system, same historical-fact convention as currentMonthInvoice
};

/** getCardMonthlyEvolution — 6 months before through 6 months after the viewed reference month
 * (13 months total), by card_installments.competence (never purchase_date). `total` is the
 * historical billed total for that month (like CardSummaryDTO.currentMonthInvoice — doesn't
 * exclude paid_before_system installments). `paid`/`unpaid` split that same `total` into the
 * portion already covered and the portion still owed, using the same oldest-competence-first
 * payment allocation as CardSummaryDTO.currentMonthPaidAmount (paid_before_system installments
 * count as paid outright) — the chart stacks them green/red when no category filter is active.
 * Only meaningful with no category filter (payments aren't attributable to a category); when
 * `categoryIds` is passed both are 0 and the chart stacks `byCategory` instead. `byCategory`
 * breaks the same total down per category present in that month's category-filtered purchases.
 * See AI_CONTEXT.md "Credit Card Purchases". */
export type CardMonthlyEvolutionDTO = {
  month: string;
  total: number;
  paid: number;
  unpaid: number;
  byCategory: { categoryId: string; categoryName: string; color: string; amount: number }[];
};

export type CardInstallmentDTO = {
  id: string;
  purchaseId: string;
  installmentNumber: number;
  totalInstallments: number;
  amount: number;
  competenceMonth: string;
  description: string;
  purchaseDate: string; // the purchase's real date (not competence) — drives display ordering and the "dd/mm/yyyy - descrição" list line
  paidBeforeSystem: boolean; // backfilled/retroactive purchase installment already paid outside the system — excluded from the card's outstanding/committed balance, see AI_CONTEXT.md "Compras retroativas"
};

export type BudgetDTO = {
  id: string;
  categoryId: string;
  categoryName: string;
  subcategoryId?: string;
  subcategoryName?: string;
  plannedAmount: number;
  actualAmount: number;
  status: "OK" | "EXCEEDED";
};

export type FixedExpenseDTO = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  subcategoryId?: string;
  subcategoryName?: string;
  plannedAmount: number;
  dueDay: number;
  defaultAccountId?: string;
  startCompetence: string; // "YYYY-MM" — obrigatório; mês a partir do qual a despesa passa a existir/contar no orçamento
  endCompetence?: string; // "YYYY-MM" — opcional; ausente = ainda vigente. Ver AI_CONTEXT.md "Despesas Programadas — janela de competência"
  actualAmount: number;
  projectedAmount: number;
  isPaidThisMonth: boolean;
  paidDate?: string; // set only when isPaidThisMonth — date of the linked transaction/card purchase that paid it this month
  status: "OK" | "EXCEEDED";
};

// Tree-shaped, grouped read used by /budgets and the dashboard panel (AI_CONTEXT.md "Budgets").
// A category's `budget` is null whenever there's no active row for it this month — this is never
// a computed stand-in (e.g. "sum of subcategories"): an implicit total would create false alerts,
// since a category's actualAmount already covers every subcategory under it, tracked or not. When
// `budget` is null, the UI shows no category-level number at all — see budget-tree.tsx.
export type BudgetTreeSubcategoryDTO = {
  budgetId: string;
  subcategoryId: string;
  subcategoryName: string;
  plannedAmount: number;
  actualAmount: number;
  status: "OK" | "EXCEEDED";
  fixedExpenses: FixedExpenseDTO[];
};

export type BudgetTreeCategoryDTO = {
  categoryId: string;
  categoryName: string;
  icon: string | null;
  budget: { id: string; plannedAmount: number; actualAmount: number; status: "OK" | "EXCEEDED" } | null;
  subcategories: BudgetTreeSubcategoryDTO[]; // always real rows
  directFixedExpenses: FixedExpenseDTO[]; // implies budget !== null, by construction
};

// Drives which months are plannable right now and what a "clonar orçamento" action copies from —
// see getBudgetMonthWindow (budgets.service.ts) and AI_CONTEXT.md "Budgets".
export type BudgetMonthWindowDTO = {
  currentMonth: string;
  nextMonth: string;
  hasCurrentMonthBudget: boolean;
  lastRegisteredMonth: string | null;
};

/* Additional DTOs — needed by Accounts/Categories/Cards screens, not
   explicitly enumerated in ARCHITECTURE.md's DTO list but following the
   same "service returns DTO, never a raw row" rule. */

export type AccountDTO = {
  id: string;
  type: AccountType;
  name: string;
  color: string | null;
  active: boolean;
  institutionId: string | null;
  institutionName: string | null;
  institutionColor: string | null;
  balance: number;
  // type-specific extension fields, present only for the matching type
  initialBalance?: number; // CASH, BANK
  overdraftLimit?: number; // BANK
  closingDay?: number; // CREDIT_CARD
  dueDay?: number; // CREDIT_CARD
  creditLimit?: number | null; // CREDIT_CARD — required and always > 0 (migration 0008); null only for non-CREDIT_CARD accounts. Only a purchase pushing past this limit is soft-enforced (UI warning, never blocks) — the limit's presence itself is not optional.
};

export type FinancialInstitutionDTO = { id: string; name: string; color: string | null };

export type CategoryDTO = {
  id: string;
  name: string;
  type: CategoryType;
  color: string;
  icon: string | null;
  isSystem: boolean;
  isDefault: boolean;
  active: boolean;
  subcategories: SubcategoryDTO[];
};

export type SubcategoryDTO = { id: string; categoryId: string; name: string; active: boolean };

export type ProfileDTO = { name: string | null; email: string | null; phone: string | null; onboardingCompleted: boolean };

export type CategoryUsageDTO = {
  count: number;
  preview: TransactionViewDTO[];
  budgetsCount: number;
  fixedExpensesCount: number;
  reservoirsCount: number;
  debtsCount: number;
};

/**
 * Onboarding / Settings "Importar categorias padrão" tree picker. Always lists the FULL
 * `is_default` catalog (not just what's missing) so the user always sees the whole starter pack;
 * `alreadyImported` items render checked+disabled in the UI (can't be deselected) while still
 * being visible, and `userCategoryId` lets a still-missing subcategory be attached to the user's
 * existing category copy instead of creating a duplicate. See AI_CONTEXT.md "Onboarding".
 */
export type CategoryImportOptionDTO = {
  id: string; // is_default category id — the value submitted when NOT already imported
  name: string;
  type: CategoryType;
  color: string;
  icon: string | null;
  alreadyImported: boolean;
  userCategoryId: string | null; // set when alreadyImported — the user's own copy of this category
  subcategories: {
    id: string; // is_default subcategory id — the value submitted when NOT already imported
    name: string;
    alreadyImported: boolean;
  }[];
};
