-- PLANIMPv2 — extend characters with public-detail fields.
ALTER TABLE characters ADD COLUMN IF NOT EXISTS description_md        TEXT;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS description_html       TEXT;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS tagline                VARCHAR(200);
ALTER TABLE characters ADD COLUMN IF NOT EXISTS lore_sections_md       JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS example_dialog_md      TEXT;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS example_dialog_html    TEXT;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS is_secret_prompt_hidden BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS total_views            INTEGER NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS total_chats            INTEGER NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS total_likes            INTEGER NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS total_bookmarks        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS total_ratings          INTEGER NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS avg_stars              REAL    NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS published_at           TIMESTAMPTZ;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS updated_public_at      TIMESTAMPTZ;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS slug                   VARCHAR(120);
ALTER TABLE characters ADD COLUMN IF NOT EXISTS total_comments         INTEGER NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS total_roses            INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS characters_slug_idx
  ON characters(slug) WHERE slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS characters_public_lang_idx
  ON characters(is_public, language, updated_public_at DESC);

CREATE INDEX IF NOT EXISTS characters_views_idx
  ON characters(total_views DESC) WHERE is_public = true;
