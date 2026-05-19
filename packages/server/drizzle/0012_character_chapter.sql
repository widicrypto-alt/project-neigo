-- Chapter / gender / age metadata for Discover chapters.
ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS chapter INTEGER,
  ADD COLUMN IF NOT EXISTS gender VARCHAR(1),
  ADD COLUMN IF NOT EXISTS age INTEGER,
  ADD COLUMN IF NOT EXISTS discover_order INTEGER;

CREATE INDEX IF NOT EXISTS characters_chapter_idx
  ON characters (chapter, gender, is_public);
