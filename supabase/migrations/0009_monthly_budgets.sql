-- ============================================================
-- Budgets become month-scoped (decided 2026-08-08, AI_CONTEXT.md "Budgets") — previously a
-- single "standing target" row per category/subcategory with no month, so raising a budget
-- (e.g. rent going up) silently overwrote history instead of preserving it. Every budget row
-- now belongs to exactly one calendar month; existing rows backfill to the current real month
-- (a standing budget becomes "this month's" budget going forward — the least surprising default,
-- since it was already being read as "the" budget until now).
-- ============================================================

ALTER TABLE public.budgets
  ADD COLUMN month date NOT NULL DEFAULT date_trunc('month', now())::date;
ALTER TABLE public.budgets ALTER COLUMN month DROP DEFAULT;

-- Partial index, not a plain UNIQUE constraint: budgets use the same soft-delete convention as
-- the rest of the schema (`active`), and the auto-deactivate mechanic in
-- deactivateCategoryBudgetIfOverCommitted (_shared.ts) can leave a deactivated row behind for a
-- (user, category, null subcategory, month) tuple that a *new* active budget later reuses — a
-- plain unique constraint would wrongly collide the new insert against the old inactive row.
-- NULLS NOT DISTINCT mirrors the same need already documented on `categories` — subcategory_id
-- is null for category-level rows, and those still need to collide correctly per (user, category,
-- month) instead of Postgres treating every NULL as distinct.
CREATE UNIQUE INDEX budgets_user_category_subcategory_month_unique
  ON public.budgets (user_id, category_id, subcategory_id, month)
  NULLS NOT DISTINCT
  WHERE active = true;

CREATE INDEX budgets_user_month_idx ON public.budgets (user_id, month);
