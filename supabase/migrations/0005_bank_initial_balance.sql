-- ============================================================
-- bank_accounts was missing initial_balance (only cash_accounts had it),
-- forcing every new BANK account to start at zero and requiring an
-- immediate "Ajustar Saldo" just to reflect its real starting balance.
-- Mirrors cash_accounts' column exactly.
-- ============================================================

ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS initial_balance numeric(14,2) NOT NULL DEFAULT 0;
