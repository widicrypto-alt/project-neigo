-- BACKLOG B1.2 — Translation cache invalidation via source hash.
-- Adds a source_hash column to content_translations so the translate route
-- can compare the current source markdown hash against the cached one and
-- bust the cache when the underlying field has been edited.

ALTER TABLE content_translations
  ADD COLUMN IF NOT EXISTS source_hash varchar(40) NOT NULL DEFAULT '';

-- Helpful composite index when checking cache validity per field.
CREATE INDEX IF NOT EXISTS content_translations_hash_idx
  ON content_translations (entity_type, entity_id, field_key, target_lang, source_hash);
