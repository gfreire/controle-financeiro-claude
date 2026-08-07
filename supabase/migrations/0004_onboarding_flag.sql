-- ============================================================
-- Tracks whether a user has been through the onboarding category-picker
-- at least once. Needed because "user has zero categories" isn't a safe
-- signal on its own — a user who deliberately imports zero categories on
-- their first pass (or deletes all of them later) would otherwise get
-- bounced back to /onboarding on every login forever.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;
