-- PLANIMPv3 — extend stories with rich plot fields & detail-page columns.
ALTER TABLE stories ADD COLUMN IF NOT EXISTS slug                 VARCHAR(120);
CREATE UNIQUE INDEX IF NOT EXISTS stories_slug_idx ON stories(slug) WHERE slug IS NOT NULL;

ALTER TABLE stories ADD COLUMN IF NOT EXISTS plot_md              TEXT;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS plot_html            TEXT;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS ai_plot_md           TEXT;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS ai_plot_html         TEXT;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS ai_guidelines_md     TEXT;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS ai_reminder_md       TEXT;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS output_reminder_md   TEXT;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS is_advanced_mode     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS is_secret_mode       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS is_adult_18plus      BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS contains_minors      BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS play_as_character_id VARCHAR(36) REFERENCES characters(id) ON DELETE SET NULL;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS dungeon_mind_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS opening_quote        VARCHAR(280);
ALTER TABLE stories ADD COLUMN IF NOT EXISTS opening_quote_by     VARCHAR(120);
ALTER TABLE stories ADD COLUMN IF NOT EXISTS total_comments       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS total_ratings        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS avg_stars            REAL    NOT NULL DEFAULT 0;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS total_roses          INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS vn_fg_count          INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS vn_bg_count          INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS vn_readiness_pct     REAL    NOT NULL DEFAULT 0;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS updated_public_at    TIMESTAMPTZ;

-- Extend story_scenes with rich scenario fields.
ALTER TABLE story_scenes ADD COLUMN IF NOT EXISTS token_count     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE story_scenes ADD COLUMN IF NOT EXISTS opening_md      TEXT;
ALTER TABLE story_scenes ADD COLUMN IF NOT EXISTS opening_html    TEXT;
