-- Add founding-reader badge fields for existing databases.
-- Safe to run repeatedly.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_founding_reader boolean NOT NULL DEFAULT true;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS founding_reader_at timestamptz;
