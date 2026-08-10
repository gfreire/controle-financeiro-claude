-- Postgres never auto-indexes foreign keys (only PRIMARY KEY / UNIQUE get one automatically),
-- and this schema had exactly one explicit index (budgets_user_month_idx) before this file.
-- These target the columns services actually filter/join on (confirmed by grepping every
-- .eq()/.gte()/.lte()/.in() in src/services/*.ts) — RLS's own `auth.uid() = user_id` check,
-- plus the app-level date-range/category/account filters layered on top of it. With this
-- project's current row counts the planner mostly seq-scans regardless, so this alone won't
-- explain today's perceived slowness (see the getUser()/N+1 fixes shipped alongside this
-- migration for that) — but every one of these is a real join/filter path that degrades as
-- history accumulates, so there's no reason to wait for it to become a problem.

-- transactions: date-range is the single most common filter (dashboard, /transactions,
-- /budgets), always paired with user_id via RLS; category/subcategory/account/fixed_expense
-- are each filtered independently elsewhere (dashboard chart-click filters, account balance
-- calc, fixed-expense actual-amount lookup, fixed-expense payment cancellation).
CREATE INDEX IF NOT EXISTS transactions_user_date_idx ON public.transactions (user_id, date);
CREATE INDEX IF NOT EXISTS transactions_category_id_idx ON public.transactions (category_id) WHERE category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS transactions_subcategory_id_idx ON public.transactions (subcategory_id) WHERE subcategory_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS transactions_origin_account_id_idx ON public.transactions (origin_account_id) WHERE origin_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS transactions_destination_account_id_idx ON public.transactions (destination_account_id) WHERE destination_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS transactions_fixed_expense_id_idx ON public.transactions (fixed_expense_id) WHERE fixed_expense_id IS NOT NULL;

-- card_purchases: credit_card_id drives every Cards-page query; category/subcategory feed
-- getActualAmountForCategory (budgets); fixed_expense_id feeds getFixedExpenses/cancelFixedExpensePayment.
CREATE INDEX IF NOT EXISTS card_purchases_credit_card_id_idx ON public.card_purchases (credit_card_id);
CREATE INDEX IF NOT EXISTS card_purchases_category_id_idx ON public.card_purchases (category_id) WHERE category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS card_purchases_subcategory_id_idx ON public.card_purchases (subcategory_id) WHERE subcategory_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS card_purchases_fixed_expense_id_idx ON public.card_purchases (fixed_expense_id) WHERE fixed_expense_id IS NOT NULL;

-- card_installments: purchase_id is used in almost every card/dashboard/budget query (via
-- .in(purchaseIds)) to pull a purchase's installments; competence drives every credit-card
-- analytic (AI_CONTEXT.md — never purchase_date). Also backs the RLS EXISTS-against-parent check.
CREATE INDEX IF NOT EXISTS card_installments_purchase_id_idx ON public.card_installments (purchase_id);
CREATE INDEX IF NOT EXISTS card_installments_credit_card_competence_idx ON public.card_installments (credit_card_id, competence);

-- Ledger children keyed by their parent — reservoirs/debts balance calc (getReservoirs/getDebts)
-- and their own RLS EXISTS-against-parent policy both hit these.
CREATE INDEX IF NOT EXISTS reservoir_transactions_reservoir_id_idx ON public.reservoir_transactions (reservoir_id);
CREATE INDEX IF NOT EXISTS debt_transactions_debt_id_idx ON public.debt_transactions (debt_id);

-- fixed_expenses: user_id for the base list query; category/subcategory feed the budget-floor
-- reconciliation (_shared.ts getCategoryBudgetFloor/getSubcategoryBudgetFloor).
CREATE INDEX IF NOT EXISTS fixed_expenses_user_id_idx ON public.fixed_expenses (user_id);
CREATE INDEX IF NOT EXISTS fixed_expenses_category_id_idx ON public.fixed_expenses (category_id) WHERE category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fixed_expenses_subcategory_id_idx ON public.fixed_expenses (subcategory_id) WHERE subcategory_id IS NOT NULL;

-- Simple user_id lookups on the remaining user-scoped tables that didn't already get one via a
-- unique constraint's leading column.
CREATE INDEX IF NOT EXISTS accounts_user_id_idx ON public.accounts (user_id);
CREATE INDEX IF NOT EXISTS debts_user_id_idx ON public.debts (user_id);
CREATE INDEX IF NOT EXISTS reservoirs_user_id_idx ON public.reservoirs (user_id);
