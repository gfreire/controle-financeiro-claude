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
};

export type MonthlyEvolutionDTO = { month: string; income: number; expense: number };

export type CategoryDistributionDTO = {
  categoryId: string;
  categoryName: string;
  total: number;
  color: string;
  icon: string | null;
};

export type CategoryComparisonDTO = { categoryName: string; total: number };

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
  amount: number;
  source: "transaction" | "installment";
};

export type ReservoirDTO = { id: string; name: string; balance: number; categoryId: string | null; categoryName: string | null };

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
};

export type DebtTransactionDTO = {
  id: string;
  debtId: string;
  date: string;
  description: string | null;
  amount: number;
  linkedTransactionId?: string;
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
};

export type CardInstallmentDTO = {
  id: string;
  purchaseId: string;
  installmentNumber: number;
  totalInstallments: number;
  amount: number;
  competenceMonth: string;
  description: string;
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
  plannedAmount: number;
  dueDay: number;
  defaultAccountId?: string;
  actualAmount: number;
  projectedAmount: number;
  isPaidThisMonth: boolean;
  status: "OK" | "EXCEEDED";
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
};
