import type { AccountType, CategoryType, DebtSide, TransactionType } from "./database";

/**
 * DTOs — source of truth is DOC/ARCHITECTURE.md. UI components only ever
 * consume these, never raw table rows from `database.ts`.
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
};

export type FinancialSummaryDTO = {
  balance: number;
  income: number;
  expense: number;
  result: number;
  adjustmentShare: number; // % of period total sitting under "Ajuste" — bookkeeping-looseness signal
  retroactiveIncomeShare: number; // % of period total from paid-before-system installments — distinct signal from adjustmentShare, see AI_CONTEXT.md "Compras retroativas"
};

export type MonthlyEvolutionDTO = { month: string; income: number; expense: number };

export type CategoryDistributionDTO = {
  categoryId: string;
  categoryName: string;
  total: number;
  color: string;
  icon: string | null;
};

export type CategoryComparisonDTO = { categoryId: string; categoryName: string; total: number; color: string };

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
  originalAmount: number;
  remainingBalance: number;
  active: boolean;
  defaultCategoryId?: string; // pré-preenche (sobrescrevível) a categoria de um pagamento registrado contra a dívida
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
};

export type CardSummaryDTO = {
  accountId: string;
  creditLimit: number | null;
  usedThroughCurrentMonth: number; // = getCardBalanceThroughMonth(cardId, todayMonth) — installments due through TODAY's real month minus payments, floored at 0. Drives the "Pagar fatura" suggested amount; always today-anchored, independent of the page's month filter.
  currentMonthInvoice: number; // sum of card_installments.amount where competence falls in the page's VIEWED month (the month filter), not necessarily today's month
  overdueAmount: number; // = usedThroughCurrentMonth - (today's month invoice), floored at 0 — unpaid balance from prior months, always today-anchored
  totalCommitted: number; // = getCardTotalCommitted — ALL installments ever generated (incl. future not-yet-due) minus all payments, floored at 0. The correct "used against the limit" figure.
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
  creditLimit?: number | null; // CREDIT_CARD — optional, soft-enforced (UI warning only, never blocks)
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
