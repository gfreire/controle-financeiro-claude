-- ============================================================
-- Decided 2026-08-08 (AI_CONTEXT.md "Accounts"): a credit card account must always carry a
-- real, positive limit — this replaces the earlier "optional, soft-enforced" design from
-- migration 0007. The soft-enforce behavior on PURCHASES that exceed the limit is unchanged
-- (still just a warning, never blocks); what changes is that the limit itself can no longer
-- be absent or zero. Application layer (src/lib/validations/accounts.ts) already requires
-- and validates this on create/update; this migration backs it with a DB constraint too.
--
-- Safe to run as-is: every credit_cards row in this deployment already has a positive
-- credit_limit. If a future environment ever has a NULL/0 row, backfill it before applying.
-- ============================================================

ALTER TABLE public.credit_cards
  ALTER COLUMN credit_limit SET NOT NULL;

ALTER TABLE public.credit_cards
  ADD CONSTRAINT credit_cards_credit_limit_positive CHECK (credit_limit > 0);
