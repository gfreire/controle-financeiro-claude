-- Lets a fixed expense be paid through a credit card, not just a plain transaction against a
-- CASH/BANK account. A fixed bill that's actually charged to a card every month (e.g. a
-- streaming subscription) needs to flow through the normal card_purchases -> card_installments
-- pipeline so it's tracked by competence like any other card purchase — not as a fake plain
-- expense against an account type (CREDIT_CARD) transactions was never meant to touch directly.
-- payFixedExpense() always registers these as a single-installment (1x) purchase.
ALTER TABLE public.card_purchases
  ADD COLUMN fixed_expense_id uuid REFERENCES public.fixed_expenses(id) ON DELETE SET NULL;
