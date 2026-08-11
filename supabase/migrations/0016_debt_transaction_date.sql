-- Adds an explicit, user-editable `date` to debt_transactions — same gap, same fix as migration
-- 0011 for reservoir_transactions: DebtTransactionDialog always showed a date picker, but the
-- service only ever used it for the linked `transactions` row (when one exists); the ledger row
-- itself only had `created_at` (a timestamp, not user-editable after insert), so an unlinked
-- entry's chosen date was silently discarded and always read back as "today". Needed now that
-- debt transactions become editable (see debts.service.ts#updateDebtTransaction) — there must be
-- a real column to edit.
ALTER TABLE public.debt_transactions
  ADD COLUMN date date NOT NULL DEFAULT CURRENT_DATE;

-- Backfill existing rows from created_at so history keeps its original date instead of
-- collapsing to "today" (the ALTER's DEFAULT only applies to already-existing rows at add-time).
UPDATE public.debt_transactions SET date = created_at::date;
