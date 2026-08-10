-- Adds an explicit, user-editable `date` to reservoir_transactions.
-- The AccrualDialog always showed a date picker, but the service never persisted it — only
-- `created_at` (a timestamp, not editable after insert) existed, so the chosen date was
-- silently discarded and every entry read as "today" forever. Users need to backdate/correct
-- an accrual entry's date after the fact, so it must be a real, updatable column.
ALTER TABLE public.reservoir_transactions
  ADD COLUMN date date NOT NULL DEFAULT CURRENT_DATE;

-- Backfill existing rows from created_at so history keeps its original date instead of
-- collapsing to "today" (the ALTER's DEFAULT only applies to already-existing rows at add-time).
UPDATE public.reservoir_transactions SET date = created_at::date;
