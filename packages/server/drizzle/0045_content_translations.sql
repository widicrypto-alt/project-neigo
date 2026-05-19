-- PLANIMPv6 §5 — translation cache keyed by (entity, field, target language).
CREATE TABLE IF NOT EXISTS content_translations (
  id            VARCHAR(36) PRIMARY KEY,
  entity_type   VARCHAR(16) NOT NULL,
  entity_id     VARCHAR(36) NOT NULL,
  field_key     VARCHAR(40) NOT NULL,
  source_lang   VARCHAR(8)  NOT NULL,
  target_lang   VARCHAR(8)  NOT NULL,
  content_md    TEXT NOT NULL,
  content_html  TEXT NOT NULL DEFAULT '',
  cost_usd      REAL NOT NULL DEFAULT 0,
  tokens_in     INTEGER NOT NULL DEFAULT 0,
  tokens_out    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entity_type, entity_id, field_key, target_lang)
);

CREATE INDEX IF NOT EXISTS content_translations_entity_idx
  ON content_translations(entity_type, entity_id);

ALTER TABLE content_translations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS content_translations_public_read ON content_translations;
CREATE POLICY content_translations_public_read ON content_translations
  FOR SELECT USING (true);
DROP POLICY IF EXISTS content_translations_server_write ON content_translations;
CREATE POLICY content_translations_server_write ON content_translations
  FOR ALL USING (true); -- Write performed by server role, not per-user
