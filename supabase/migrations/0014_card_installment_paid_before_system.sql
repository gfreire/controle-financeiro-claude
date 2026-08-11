-- Lets a credit card purchase be backfilled from before the user started using the system,
-- where some installments were already paid in real life with no tracked payment recorded
-- here (e.g. a purchase made 4 months ago, already being paid off, and the user wants to log
-- the full purchase — not just the remaining balance — for category history's sake).
--
-- `card_purchases.paid_through_competence` is the user's input ("já paguei até este mês").
-- `card_installments.paid_before_system` is the derived per-installment flag, applied to a
-- contiguous prefix of installments (every one whose competence <= paid_through_competence at
-- generation time, in the same order card_purchases.installments are always generated in) —
-- never an arbitrary subset. It:
--   - excludes the installment from the card's outstanding/committed balance
--     (cards.service.ts#getCardBalanceThroughMonth / getCardTotalCommitted) — it's already
--     settled, just not through a `card_payments` row tracked by this system;
--   - does NOT exclude it from category/expense analytics — card_installments already feeds
--     those regardless of this flag, no change needed there;
--   - additionally counts toward the dashboard's INCOME total for its competence month
--     (dashboard.service.ts#fetchRetroactiveIncomeEntries), since real money necessarily paid
--     for it even though the system doesn't know its source — computed at query time, never a
--     real `transactions` row, and kept a distinct signal from the existing "Ajuste" concept
--     (Ajuste is about bookkeeping looseness; this is about a purchase genuinely predating the
--     system).
ALTER TABLE public.card_purchases
  ADD COLUMN paid_through_competence date;

ALTER TABLE public.card_installments
  ADD COLUMN paid_before_system boolean NOT NULL DEFAULT false;
