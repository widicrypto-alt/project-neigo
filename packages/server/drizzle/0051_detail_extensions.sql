-- 0051_detail_extensions.sql
-- PLANIMPv2/v3 backend extensions:
--  1. characters.persona_md JSONB       — structured persona (nullable, falls back to flat derive)
--  2. characters.token_count_cache JSONB — {description, exampleDialog, total}
--  3. stories.token_count_cache JSONB    — {plot, characters, scenarios, total}
-- FK for stories.play_as_character_id is NOT added: we keep nullable soft reference
-- (owner may delete the referenced character without cascading story damage).

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS persona_md JSONB;

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS token_count_cache JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS token_count_cache JSONB NOT NULL DEFAULT '{}'::jsonb;
