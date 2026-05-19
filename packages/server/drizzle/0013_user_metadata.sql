-- 0013_user_metadata.sql
-- Adds `metadata` jsonb column to users for storing flexible client-side flags
-- such as onboardingCompleted, preferences, tour state, etc. Non-breaking:
-- defaults to empty object, NOT NULL.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
