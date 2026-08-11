-- Adds a default category to a debt (debts.default_category_id), set once when the debt is
-- registered and used to pre-fill the category of a payment transaction going forward — decided
-- 2026-08-11, at the user's request, so a recurring debt doesn't need its category re-picked by
-- hand on every payment. The user can still override it on any individual payment; this is only
-- a starting value, same convention as reservoirs.default_percentage/default_destination_account_id.
--
-- No ON DELETE clause (RESTRICT by default) — same reasoning as every other category_id FK in
-- this schema (see AI_GENERATION_RULES.md "Domain Rules Enforcement"): deleting a category that a
-- debt still points to as its default must go through the guided reassignment flow, never silently
-- null out or cascade. Wired into categories.service.ts's countReferences/reassignCategory/
-- getCategoryUsage alongside transactions/card_purchases/budgets/fixed_expenses/reservoirs.
ALTER TABLE public.debts
  ADD COLUMN default_category_id uuid REFERENCES public.categories(id);
