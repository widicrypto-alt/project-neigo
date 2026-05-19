-- PLANIMPv1 §4.1 — append-only revision history for rich-text fields.
CREATE TABLE IF NOT EXISTS content_revisions (
  id             VARCHAR(36) PRIMARY KEY,
  entity_type    VARCHAR(16) NOT NULL,
  entity_id      VARCHAR(36) NOT NULL,
  field_key      VARCHAR(40) NOT NULL,
  version        INTEGER NOT NULL DEFAULT 1,
  author_id      VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  summary        VARCHAR(200),
  content_md     TEXT NOT NULL,
  content_html   TEXT NOT NULL DEFAULT '',
  token_count    INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS content_revisions_entity_idx
  ON content_revisions(entity_type, entity_id, field_key, version DESC);

CREATE INDEX IF NOT EXISTS content_revisions_author_idx
  ON content_revisions(author_id, created_at DESC);

ALTER TABLE content_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_revisions_owner_all ON content_revisions;
CREATE POLICY content_revisions_owner_all ON content_revisions
  FOR ALL USING (author_id = current_setting('app.user_id', true)::varchar);

DROP POLICY IF EXISTS content_revisions_public_read ON content_revisions;
CREATE POLICY content_revisions_public_read ON content_revisions
  FOR SELECT USING (true);
