-- 0024_character_language_retire.sql
-- Adds first-class language filter + retirement flag + VN cast opt-in.
-- Also retires all non-beta characters (Rei Aizawa, Lysandra Virelle, Kaia Schneider stay visible).
-- Hard delete of retired data is deferred to a separate purge script.

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS language varchar(8) NOT NULL DEFAULT 'id',
  ADD COLUMN IF NOT EXISTS languages_spoken jsonb NOT NULL DEFAULT '["id"]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_retired boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_in_stories boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS characters_language_idx ON characters(language);
CREATE INDEX IF NOT EXISTS characters_is_retired_idx ON characters(is_retired);

-- Set correct language for the three beta characters that we keep.
UPDATE characters SET language = 'ja', languages_spoken = '["ja","id"]'::jsonb
  WHERE name = 'Rei Aizawa';
UPDATE characters SET language = 'en', languages_spoken = '["en","id"]'::jsonb
  WHERE name = 'Lysandra Virelle';
UPDATE characters SET language = 'id', languages_spoken = '["id","en"]'::jsonb
  WHERE name = 'Kaia Schneider';

-- Retire every built-in/public character that is not one of the three beta characters.
-- Owner-owned (non-built-in) private characters are untouched.
UPDATE characters
SET is_retired = true, is_public = false
WHERE (is_built_in = true OR is_public = true)
  AND name NOT IN ('Rei Aizawa', 'Lysandra Virelle', 'Kaia Schneider');
