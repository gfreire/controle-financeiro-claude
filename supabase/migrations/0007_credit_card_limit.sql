-- ============================================================
-- Credit limit is soft-enforced: the UI warns (and requires an explicit
-- "insert anyway" confirmation) when a new purchase would push the card
-- past its limit, but never blocks the insert outright — a real invoice
-- payment not yet logged, or a genuine mistake, are both things the user
-- should be able to see and decide about, not be locked out of fixing.
-- ============================================================

ALTER TABLE public.credit_cards
  ADD COLUMN IF NOT EXISTS credit_limit numeric(14,2);
