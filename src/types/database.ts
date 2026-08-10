/**
 * Raw table row shapes, matching DOC/schema.sql exactly. Services translate
 * these into the DTOs in `dto.ts` — UI components never see these directly.
 */

export type AccountType = "CASH" | "BANK" | "CREDIT_CARD";
export type CategoryType = "INCOME" | "EXPENSE";
export type TransactionType = "INCOME" | "EXPENSE" | "TRANSFER" | "CREDIT_CARD_PAYMENT";
export type DebtSide = "PAYABLE" | "RECEIVABLE";

export interface ProfileRow {
  user_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
}

export interface FinancialInstitutionRow {
  id: string;
  name: string;
  color: string | null;
  created_at: string;
}

export interface AccountRow {
  id: string;
  user_id: string;
  type: AccountType;
  name: string;
  institution_id: string | null;
  color: string | null;
  active: boolean;
  created_at: string;
}

export interface CashAccountRow {
  account_id: string;
  initial_balance: number;
}

export interface BankAccountRow {
  account_id: string;
  initial_balance: number;
  overdraft_limit: number;
}

export interface CreditCardRow {
  account_id: string;
  closing_day: number;
  due_day: number;
  credit_limit: number | null;
}

export interface CategoryRow {
  id: string;
  user_id: string | null;
  name: string;
  type: CategoryType;
  color: string;
  icon: string | null;
  is_system: boolean;
  is_default: boolean;
  active: boolean;
  created_at: string;
}

export interface SubcategoryRow {
  id: string;
  user_id: string | null;
  category_id: string;
  name: string;
  active: boolean;
  created_at: string;
}

export interface FixedExpenseRow {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  category_id: string | null;
  subcategory_id: string | null;
  default_account_id: string | null;
  due_day: number;
  active: boolean;
  created_at: string;
}

export interface TransactionRow {
  id: string;
  user_id: string;
  type: TransactionType;
  origin_account_id: string | null;
  destination_account_id: string | null;
  amount: number;
  date: string;
  description: string | null;
  category_id: string | null;
  subcategory_id: string | null;
  is_reservoir: boolean;
  fixed_expense_id: string | null;
  created_at: string;
}

export interface CardPurchaseRow {
  id: string;
  user_id: string;
  credit_card_id: string;
  amount: number;
  purchase_date: string;
  description: string | null;
  category_id: string | null;
  subcategory_id: string | null;
  installments: number;
  is_reservoir: boolean;
  created_at: string;
}

export interface CardInstallmentRow {
  id: string;
  purchase_id: string;
  credit_card_id: string;
  competence: string;
  amount: number;
  created_at: string;
}

export interface CardPaymentRow {
  id: string;
  user_id: string;
  credit_card_id: string;
  account_id: string;
  transaction_id: string;
  amount: number;
  payment_date: string;
  created_at: string;
}

export interface DebtRow {
  id: string;
  user_id: string;
  agent: string;
  side: DebtSide;
  initial_balance: number;
  active: boolean;
  created_at: string;
}

export interface DebtTransactionRow {
  id: string;
  debt_id: string;
  amount: number;
  description: string | null;
  linked_transaction_id: string | null;
  created_at: string;
}

export interface ReservoirRow {
  id: string;
  user_id: string;
  name: string;
  category_id: string | null;
  subcategory_id: string | null;
  active: boolean;
  created_at: string;
}

export interface ReservoirTransactionRow {
  id: string;
  reservoir_id: string;
  amount: number;
  gross_amount: number | null;
  percentage: number | null;
  description: string | null;
  linked_transaction_id: string | null;
  linked_card_purchase_id: string | null;
  date: string;
  created_at: string;
}

export interface BudgetRow {
  id: string;
  user_id: string;
  category_id: string | null;
  subcategory_id: string | null;
  amount: number;
  active: boolean;
  created_at: string;
}
