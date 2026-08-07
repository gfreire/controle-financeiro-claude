-- ============================================================
-- Removes "Pagamento de Cartão" from the default catalog under "Dívidas".
-- Paying a credit card bill is already implicit in the CASH/BANK -> CREDIT_CARD
-- transfer (transaction type CREDIT_CARD_PAYMENT), which never takes a
-- category — the real expense already shows up as the card's purchases.
-- Having this subcategory in the starter pack only invited users to log the
-- payment the wrong way (a categorized expense instead of the transfer).
--
-- Only removes it from the catalog (is_default row, user_id IS NULL) — if
-- you already imported it into your own account via onboarding, delete that
-- copy yourself from Configurações (it'll show under "Dívidas").
-- ============================================================

DELETE FROM public.subcategories
WHERE name = 'Pagamento de Cartão'
  AND user_id IS NULL
  AND category_id IN (SELECT id FROM public.categories WHERE name = 'Dívidas' AND is_default = true);
